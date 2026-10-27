process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import WhatsAppDispatch from '../models/WhatsAppDispatch.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Lead from '../models/Lead.js';
import WhatsAppService from '../services/WhatsAppService.js';

describe('Phase 9.1 — Durable Cross-Worker WhatsApp Dispatch Idempotency Test Suite', () => {
    let replset;
    let testUser;
    let activeMetaIntegration;

    before(async () => {
        replset = await MongoMemoryReplSet.create({
            replSet: {
                count: 1,
                args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=5000']
            }
        });
        await replset.waitUntilRunning();

        const uri = replset.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        // Ensure collections and unique indexes
        await WhatsAppDispatch.createCollection();
        await WhatsAppDispatch.ensureIndexes();
        await WhatsAppIntegration.createCollection();
        await User.createCollection();
        await Role.createCollection();
        await Lead.createCollection();

        // Seed Role & User
        const role = await Role.create({
            name: 'Dispatch Admin',
            department: 'sales',
            isSystemRole: true
        });

        testUser = await User.create({
            fullName: 'Dispatch Auditor',
            email: 'auditor@bharatproperties.co',
            password: 'hashed_password_secure',
            role: role._id,
            department: 'sales',
            isActive: true,
            status: 'active',
            availability: 'Available'
        });

        // Seed Default Meta WhatsApp Account
        activeMetaIntegration = await WhatsAppIntegration.create({
            provider: 'META',
            wabaId: 'waba_durable_01',
            phoneNumberId: 'phone_durable_01',
            displayPhoneNumber: '+91 99960 00570',
            accountLabel: 'Primary Durable WhatsApp',
            isDefault: true,
            connectionType: 'COEXISTENCE',
            onboardingStatus: 'CONNECTED',
            status: 'ACTIVE',
            credentials: {
                systemUserToken: 'EAAG_test_durable_secret_token'
            },
            connectedBy: testUser._id
        });
    });

    after(async () => {
        if (mongoose.connection) {
            await mongoose.disconnect();
        }
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        // Clear in-memory cache before every test to test isolation
        WhatsAppService._idempotencyCache.clear();
        await WhatsAppDispatch.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Durable Ledger Persistence on Successful Dispatch
    // ─────────────────────────────────────────────────────────────
    it('1. Durable Ledger Persistence: Outbound dispatch creates durable WhatsAppDispatch record with providerMessageId and null tenantId', async () => {
        const mobile = '919811122334';
        const idempotencyKey = 'durable_key_lead_welcome_001';
        const message = 'Welcome to Bharat Properties. Your inquiry has been received.';

        const sendResult = await WhatsAppService.sendMessage(mobile, message, { idempotencyKey });
        assert.equal(sendResult.success, true);
        assert.ok(sendResult.messageId || sendResult.messages?.[0]?.id);

        // Verify MongoDB record
        const dispatchRecord = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.ok(dispatchRecord, 'Durable WhatsAppDispatch document must exist in MongoDB');
        assert.equal(dispatchRecord.status, 'DISPATCHED');
        assert.equal(dispatchRecord.recipient, '919811122334');
        assert.equal(dispatchRecord.messageType, 'text');
        assert.equal(dispatchRecord.tenantId, null, 'Single-organisation tenantId must remain null');
        assert.ok(dispatchRecord.dispatchedAt);
        assert.ok(dispatchRecord.providerMessageId);
        assert.ok(dispatchRecord.claimWorkerId);
        assert.equal(dispatchRecord.responsePayload.success, true);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Process Restart / In-Memory Cache Eviction Recovery
    // ─────────────────────────────────────────────────────────────
    it('2. Cache Eviction / Process Restart: L2 MongoDB store prevents duplicate dispatch after L1 cache is wiped', async () => {
        const mobile = '919811155667';
        const idempotencyKey = 'durable_key_restart_recovery_002';
        const message = 'Site visit scheduled for Sector 57 tomorrow at 11 AM.';

        // Initial dispatch
        const res1 = await WhatsAppService.sendMessage(mobile, message, { idempotencyKey });
        assert.equal(res1.success, true);
        const originalMessageId = res1.messageId || res1.messages[0].id;

        // Simulate complete node process restart / cluster node boot:
        // Wipe in-memory cache entirely
        WhatsAppService._idempotencyCache.clear();
        assert.equal(WhatsAppService._getIdempotentResult(idempotencyKey), null, 'L1 cache must be empty');

        // Subsequent dispatch with same idempotencyKey
        const res2 = await WhatsAppService.sendMessage(mobile, message, { idempotencyKey });
        assert.equal(res2.success, true);
        assert.equal(res2.alreadySent, true, 'Must be flagged as already sent');
        assert.equal(res2.duplicate, true, 'Must be flagged as duplicate replay');
        assert.equal(res2.messageId || res2.messages[0].id, originalMessageId, 'Must return identical provider message ID');

        // Verify exactly 1 dispatch record in DB
        const count = await WhatsAppDispatch.countDocuments({ idempotencyKey });
        assert.equal(count, 1, 'Only exactly 1 dispatch record must exist');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Concurrent Multi-Worker Mutual Exclusion & Claim Safety
    // ─────────────────────────────────────────────────────────────
    it('3. Concurrent Multi-Worker Race Prevention: Atomic claim ensures only one worker dispatches and other re-uses response', async () => {
        const mobile = '919877700111';
        const idempotencyKey = 'durable_key_concurrent_race_003';
        const message = 'Payment receipt BP-REC-9081 generated.';

        // Execute 5 concurrent dispatch attempts simultaneously
        const concurrentAttempts = Array.from({ length: 5 }, (_, idx) => 
            WhatsAppService.sendMessage(mobile, message, { idempotencyKey, attemptIdx: idx })
        );

        const results = await Promise.all(concurrentAttempts);

        // Every attempt should succeed (either primary dispatch or duplicate replay/in-flight reuse)
        const successful = results.filter(r => r.success);
        assert.equal(successful.length, 5, 'All concurrent workers must resolve successfully');

        // Verify only 1 record in database
        const records = await WhatsAppDispatch.find({ idempotencyKey });
        assert.equal(records.length, 1, 'Must have exactly one dispatch document');
        assert.equal(records[0].status, 'DISPATCHED');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Durable Template Dispatch Idempotency
    // ─────────────────────────────────────────────────────────────
    it('4. Template Dispatch Idempotency: sendTemplate persists durable record and suppresses replays across restarts', async () => {
        const mobile = '919876543210';
        const idempotencyKey = 'durable_template_key_brochure_004';

        // 1. First template send
        const t1 = await WhatsAppService.sendTemplate(
            mobile,
            'property_launch_alert',
            'en_US',
            [{ type: 'body', parameters: [{ type: 'text', text: 'Kurukshetra Heights' }] }],
            { idempotencyKey }
        );
        assert.equal(t1.success, true);

        // Check DB record
        const doc = await WhatsAppDispatch.findOne({ idempotencyKey });
        assert.ok(doc);
        assert.equal(doc.messageType, 'template');
        assert.equal(doc.status, 'DISPATCHED');
        assert.equal(doc.tenantId, null);

        // 2. Wipe L1 in-memory cache to simulate restart
        WhatsAppService._idempotencyCache.clear();

        // 3. Second template send: safely resolved from L2 MongoDB ledger
        const t2 = await WhatsAppService.sendTemplate(
            mobile,
            'property_launch_alert',
            'en_US',
            [{ type: 'body', parameters: [{ type: 'text', text: 'Kurukshetra Heights' }] }],
            { idempotencyKey }
        );
        assert.equal(t2.success, true);
        assert.equal(t2.alreadySent, true);
        assert.equal(t2.duplicate, true);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Durable Media Dispatch Idempotency
    // ─────────────────────────────────────────────────────────────
    it('5. Media Dispatch Idempotency: sendMedia creates durable record and avoids duplicate media send', async () => {
        const mobile = '919811998877';
        const idempotencyKey = 'durable_media_key_layout_plan_005';

        const m1 = await WhatsAppService.sendMedia(
            mobile,
            'image',
            'https://storage.googleapis.com/bharat-properties-public/floorplan.jpg',
            'Floorplan Layout Sector 4',
            'floorplan.jpg',
            { idempotencyKey }
        );
        assert.equal(m1.success, true);

        const record = await WhatsAppDispatch.findOne({ idempotencyKey });
        assert.ok(record);
        assert.equal(record.messageType, 'image');
        assert.equal(record.status, 'DISPATCHED');

        // Evict L1 cache
        WhatsAppService._idempotencyCache.clear();

        const m2 = await WhatsAppService.sendMedia(
            mobile,
            'image',
            'https://storage.googleapis.com/bharat-properties-public/floorplan.jpg',
            'Floorplan Layout Sector 4',
            'floorplan.jpg',
            { idempotencyKey }
        );
        assert.equal(m2.success, true);
        assert.equal(m2.alreadySent, true);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Failed Attempt Recovery & Atomic Re-claim
    // ─────────────────────────────────────────────────────────────
    it('6. Failed Attempt Recovery: A failed dispatch can be atomically re-claimed and retried to success', async () => {
        const mobile = '919877712345';
        const idempotencyKey = 'durable_retry_recovery_006';

        // Pre-seed a FAILED dispatch record in MongoDB (e.g. from previous network timeout)
        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'FAILED',
            claimedAt: new Date(Date.now() - 60000), // 1 min ago
            errorDetails: { message: 'Network connection timeout to Meta Graph API' },
            tenantId: null
        });

        // Retry dispatch with same idempotencyKey
        const retryResult = await WhatsAppService.sendMessage(mobile, 'Retry message after transient recovery', { idempotencyKey });
        assert.equal(retryResult.success, true);

        // Verify status transitioned from FAILED to DISPATCHED
        const updatedRecord = await WhatsAppDispatch.findOne({ idempotencyKey });
        assert.equal(updatedRecord.status, 'DISPATCHED');
        assert.ok(updatedRecord.dispatchedAt);
        assert.equal(updatedRecord.tenantId, null);
    });
});
