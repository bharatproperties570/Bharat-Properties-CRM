process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import WhatsAppDispatch from '../models/WhatsAppDispatch.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Lead from '../models/Lead.js';
import WhatsAppService from '../services/WhatsAppService.js';

describe('Phase 9.1 — Durable Cross-Worker WhatsApp Dispatch Idempotency & Fencing Test Suite', () => {
    let mongod;
    let testUser;
    let activeMetaIntegration;

    before(async () => {
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        // Ensure collections and unique indexes
        await WhatsAppDispatch.createCollection();
        await WhatsAppDispatch.ensureIndexes();
        await WhatsAppIntegration.createCollection();
        await User.createCollection();
        await Role.createCollection();
        await Lead.createCollection();

        process.env.INTERNAL_SERVICE_SECRET = 'test_internal_service_secret_phase91';

        // Seed Role & User with explicit 'whatsapp.dispatch.reconcile' permission
        const role = await Role.create({
            name: 'Dispatch Admin',
            department: 'sales',
            isSystemRole: true,
            permissions: ['whatsapp.dispatch.reconcile']
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
        if (mongod) {
            await mongod.stop();
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
    it('1. Durable Ledger Persistence: Outbound dispatch creates durable WhatsAppDispatch record with providerMessageId, claimGeneration, and null tenantId', async () => {
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
        assert.equal(dispatchRecord.claimGeneration, 1, 'Initial claim generation must be 1');
        assert.equal(dispatchRecord.isAmbiguous, false);
        assert.equal(dispatchRecord.tenantId, null, 'Single-organisation tenantId must remain null');
        assert.ok(dispatchRecord.dispatchedAt);
        assert.ok(dispatchRecord.providerMessageId);
        assert.ok(dispatchRecord.claimWorkerId);
        assert.ok(dispatchRecord.requestPayloadHash, 'Payload hash must be calculated');
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
        const concurrentAttempts = Array.from({ length: 5 }, () =>
            WhatsAppService.sendMessage(mobile, message, { idempotencyKey })
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
    // TEST 4: Fail-Closed Behavior When Database Is Unavailable
    // ─────────────────────────────────────────────────────────────
    it('4. Database Unavailable: Keyed dispatches fail-closed with DURABLE_LEDGER_UNAVAILABLE while un-keyed dispatches remain unblocked', async () => {
        const mobile = '919811188990';
        const idempotencyKey = 'durable_key_db_down_004';

        // Simulate database disconnected
        const originalReadyState = mongoose.connection.readyState;
        Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

        try {
            // Keyed send must fail closed
            const keyedResult = await WhatsAppService.sendMessage(mobile, 'Critical booking alert', { idempotencyKey });
            assert.equal(keyedResult.success, false);
            assert.equal(keyedResult.code, 'DURABLE_LEDGER_UNAVAILABLE');
            assert.ok(keyedResult.error.includes('fail-closed'));

            // Un-keyed send with verified opt-out override must continue unblocked by durable ledger
            const unkeyedResult = await WhatsAppService.sendMessage(mobile, 'Standard notification', { overrideOptOut: true });
            assert.equal(unkeyedResult.success, true);
        } finally {
            delete mongoose.connection.readyState;
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Worker Generation Fencing & Stale Finalization Rejection
    // ─────────────────────────────────────────────────────────────
    it('5. Worker Fencing: Superseded worker cannot overwrite dispatch state after another worker re-claims', async () => {
        const mobile = '919877733445';
        const idempotencyKey = 'durable_key_fencing_005';

        // Worker 1 claims at generation 1
        const claim1 = await WhatsAppService._claimOrGetDurableDispatch({
            idempotencyKey,
            mobile,
            messageType: 'text',
            provider: 'META',
            payload: { message: 'Generation test' }
        });
        assert.equal(claim1.canDispatch, true);
        assert.equal(claim1.claimGeneration, 1);

        // Fast-forward claim age to simulate 35-second slow external HTTP call
        await WhatsAppDispatch.updateOne(
            { idempotencyKey },
            { $set: { claimedAt: new Date(Date.now() - 35000) } }
        );

        // Worker 2 re-claims the stale claim, advancing generation to 2
        const claim2 = await WhatsAppService._claimOrGetDurableDispatch({
            idempotencyKey,
            mobile,
            messageType: 'text',
            provider: 'META',
            payload: { message: 'Generation test' }
        });
        assert.equal(claim2.canDispatch, true);
        assert.equal(claim2.claimGeneration, 2);

        // Worker 2 successfully completes and finalizes
        const worker2Finalize = await WhatsAppService._recordDurableSuccess({
            idempotencyKey,
            claimGeneration: claim2.claimGeneration,
            result: { success: true, messageId: 'wamid.worker2.confirmed' },
            providerMessageId: 'wamid.worker2.confirmed'
        });
        assert.equal(worker2Finalize.success, true);

        // Now Worker 1 (stale) finally wakes up and tries to finalize with generation 1
        const staleFinalize = await WhatsAppService._recordDurableSuccess({
            idempotencyKey,
            claimGeneration: claim1.claimGeneration, // 1 (superseded)
            result: { success: true, messageId: 'wamid.worker1.stale' },
            providerMessageId: 'wamid.worker1.stale'
        });

        // Worker 1 finalization MUST be rejected
        assert.equal(staleFinalize.superseded, true, 'Superseded worker finalization must be rejected');

        // Verify the database still has Worker 2's authoritative message ID
        const finalDoc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(finalDoc.providerMessageId, 'wamid.worker2.confirmed');
        assert.equal(finalDoc.claimGeneration, 2);
        assert.equal(finalDoc.status, 'DISPATCHED');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Ambiguous Timeout Handling & Blocked Retries
    // ─────────────────────────────────────────────────────────────
    it('6. Ambiguous Timeout: Network timeout sets AMBIGUOUS_TIMEOUT, blocks blind automatic retries, and allows reconciliation', async () => {
        const mobile = '919811144221';
        const idempotencyKey = 'durable_key_timeout_006';

        // Pre-create an initial claim
        const claim = await WhatsAppService._claimOrGetDurableDispatch({
            idempotencyKey,
            mobile,
            messageType: 'text',
            provider: 'META',
            payload: { mobile, message: 'Ambiguous test' }
        });

        // Simulate local network timeout (provider may have accepted, socket dropped)
        await WhatsAppService._recordDurableFailure({
            idempotencyKey,
            claimGeneration: claim.claimGeneration,
            error: 'Network connection timeout to Meta Graph API',
            isAmbiguous: true
        });

        // Check document status is AMBIGUOUS_TIMEOUT
        const timeoutDoc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(timeoutDoc.status, 'AMBIGUOUS_TIMEOUT');
        assert.equal(timeoutDoc.isAmbiguous, true);

        // Next automatic retry attempt MUST be blocked to prevent double delivery
        const retryResult = await WhatsAppService.sendMessage(mobile, 'Ambiguous test', { idempotencyKey });
        assert.equal(retryResult.success, false);
        assert.equal(retryResult.code, 'AMBIGUOUS_TIMEOUT_BLOCKED');
        assert.equal(retryResult.isAmbiguous, true);

        // Now simulate reconciliation via incoming Meta delivery status webhook with biz_opaque_callback_data
        const webhookStatus = {
            id: 'wamid.meta.reconciled.999',
            status: 'delivered',
            timestamp: String(Math.floor(Date.now() / 1000)),
            recipient_id: mobile,
            biz_opaque_callback_data: idempotencyKey
        };
        const recResult = await WhatsAppService.reconcileWebhookStatus(webhookStatus);
        assert.equal(recResult.reconciled, true);
        assert.equal(recResult.correlatedViaOpaqueData, true);
        assert.equal(recResult.providerMessageId, 'wamid.meta.reconciled.999');

        const reconciledDoc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(reconciledDoc.status, 'DISPATCHED');
        assert.equal(reconciledDoc.isAmbiguous, false);
        assert.equal(reconciledDoc.providerMessageId, 'wamid.meta.reconciled.999');
        assert.equal(reconciledDoc.deliveryStatus, 'delivered');
        assert.equal(reconciledDoc.reconciliationStatus, 'RECONCILED');

        // Subsequent send request now returns the reconciled idempotent response
        const postReconciliation = await WhatsAppService.sendMessage(mobile, 'Ambiguous test', { idempotencyKey });
        assert.equal(postReconciliation.success, true);
        assert.equal(postReconciliation.alreadySent, true);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Idempotency Key Recipient & Payload Mismatch Rejection
    // ─────────────────────────────────────────────────────────────
    it('7. Immutability Gate: Rejects key reuse when recipient or payload differs from initial claim', async () => {
        const idempotencyKey = 'durable_key_immutability_007';

        // 1. Initial valid send
        const res1 = await WhatsAppService.sendMessage('919811100001', 'Original payload A', { idempotencyKey });
        assert.equal(res1.success, true);

        // 2. Attempt to use same key for a different recipient
        const resMismatchRecipient = await WhatsAppService.sendMessage('919811199999', 'Original payload A', { idempotencyKey });
        assert.equal(resMismatchRecipient.success, false);
        assert.equal(resMismatchRecipient.code, 'IDEMPOTENCY_KEY_RECIPIENT_MISMATCH');
        assert.ok(resMismatchRecipient.error.includes('already claimed for recipient'));

        // 3. Attempt to use same key for same recipient with different payload
        const resMismatchPayload = await WhatsAppService.sendMessage('919811100001', 'Tampered payload B', { idempotencyKey });
        assert.equal(resMismatchPayload.success, false);
        assert.equal(resMismatchPayload.code, 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
        assert.ok(resMismatchPayload.error.includes('different payload'));
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Durable Template Dispatch Idempotency
    // ─────────────────────────────────────────────────────────────
    it('8. Template Dispatch Idempotency: sendTemplate persists durable record and suppresses replays across restarts', async () => {
        const mobile = '919876543210';
        const idempotencyKey = 'durable_template_key_brochure_008';

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
        assert.equal(doc.claimGeneration, 1);
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
    // TEST 9: Durable Media Dispatch Idempotency
    // ─────────────────────────────────────────────────────────────
    it('9. Media Dispatch Idempotency: sendMedia creates durable record and avoids duplicate media send', async () => {
        const mobile = '919811998877';
        const idempotencyKey = 'durable_media_key_layout_plan_009';

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
        assert.equal(record.claimGeneration, 1);

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
    // TEST 10: Failed Attempt Recovery & Atomic Re-claim
    // ─────────────────────────────────────────────────────────────
    it('10. Failed Attempt Recovery: A failed dispatch can be atomically re-claimed and retried to success', async () => {
        const mobile = '919877712345';
        const idempotencyKey = 'durable_retry_recovery_010';

        // Pre-seed a FAILED dispatch record in MongoDB (e.g. from previous network timeout)
        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'FAILED',
            claimGeneration: 1,
            claimedAt: new Date(Date.now() - 60000), // 1 min ago
            errorDetails: { message: 'Network connection timeout to Meta Graph API' },
            tenantId: null
        });

        // Retry dispatch with same idempotencyKey
        const retryResult = await WhatsAppService.sendMessage(mobile, 'Retry message after transient recovery', { idempotencyKey });
        assert.equal(retryResult.success, true);

        // Verify status transitioned from FAILED to DISPATCHED and generation incremented
        const updatedRecord = await WhatsAppDispatch.findOne({ idempotencyKey });
        assert.equal(updatedRecord.status, 'DISPATCHED');
        assert.equal(updatedRecord.claimGeneration, 2, 'Claim generation must increment on retry');
        assert.ok(updatedRecord.dispatchedAt);
        assert.equal(updatedRecord.tenantId, null);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Secret Redaction & Single-Organisation Guardrails
    // ─────────────────────────────────────────────────────────────
    it('11. Secret Redaction: Secrets in request/response payloads are redacted and tenantId is strictly null', async () => {
        const mobile = '919811199881';
        const idempotencyKey = 'durable_redaction_011';

        const result = await WhatsAppService.sendMessage(mobile, 'Confidential update', {
            idempotencyKey,
            authHeader: 'Bearer EAAG_top_secret_token_12345678',
            systemUserToken: 'EAAG_system_user_secret_token_abcdef'
        });
        assert.equal(result.success, true);

        const doc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(doc.tenantId, null, 'tenantId must strictly be null');

        const serialized = JSON.stringify(doc);
        assert.equal(serialized.includes('EAAG_top_secret_token'), false, 'Bearer token must be redacted');
        assert.equal(serialized.includes('EAAG_system_user_secret'), false, 'System user token must be redacted');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 12: Webhook with Known Provider Message ID & Monotonic Progression
    // ─────────────────────────────────────────────────────────────
    it('12. Known Provider Message ID: Webhook status progression advances deliveryStatus monotonically', async () => {
        const mobile = '919811100012';
        const idempotencyKey = 'durable_rec_known_012';
        const providerMessageId = 'wamid.known.012';

        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'DISPATCHED',
            deliveryStatus: 'sent',
            providerMessageId,
            claimGeneration: 1,
            tenantId: null
        });

        // 1. Deliver webhook status 'delivered'
        const deliveredWebhook = {
            id: providerMessageId,
            status: 'delivered',
            timestamp: '1720000000',
            recipient_id: mobile
        };
        const resDelivered = await WhatsAppService.reconcileWebhookStatus(deliveredWebhook);
        assert.equal(resDelivered.reconciled, true);
        assert.equal(resDelivered.deliveryStatus, 'delivered');

        const docAfterDelivered = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(docAfterDelivered.deliveryStatus, 'delivered');
        assert.equal(docAfterDelivered.reconciliationStatus, 'RECONCILED');

        // 2. Deliver webhook status 'read'
        const readWebhook = {
            id: providerMessageId,
            status: 'read',
            timestamp: '1720000010',
            recipient_id: mobile
        };
        const resRead = await WhatsAppService.reconcileWebhookStatus(readWebhook);
        assert.equal(resRead.reconciled, true);
        assert.equal(resRead.deliveryStatus, 'read');

        const docAfterRead = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(docAfterRead.deliveryStatus, 'read');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 13: Multiple Ambiguous Records & Insufficient Correlation Webhook
    // ─────────────────────────────────────────────────────────────
    it('13. Insufficient Correlation Gate: Multiple ambiguous records for same recipient retain ambiguous state without guessing', async () => {
        const mobile = '919811100013';

        // Pre-seed 2 ambiguous timeout records for the same recipient
        await WhatsAppDispatch.create({
            idempotencyKey: 'durable_ambiguous_rec_13a',
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });
        await WhatsAppDispatch.create({
            idempotencyKey: 'durable_ambiguous_rec_13b',
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });

        // Webhook arrives with unknown provider message ID and NO biz_opaque_callback_data
        const unknownWebhook = {
            id: 'wamid.unknown.ambiguous.013',
            status: 'delivered',
            timestamp: '1720000050',
            recipient_id: mobile
            // biz_opaque_callback_data is omitted!
        };

        const res = await WhatsAppService.reconcileWebhookStatus(unknownWebhook);
        assert.equal(res.reconciled, false);
        assert.equal(res.reason, 'MANUAL_RECONCILIATION_REQUIRED');
        assert.equal(res.ambiguousCount, 2);

        // Verify BOTH records retain AMBIGUOUS_TIMEOUT status and are flagged for manual review
        const records = await WhatsAppDispatch.find({ recipient: mobile }).lean();
        assert.equal(records.length, 2);
        for (const rec of records) {
            assert.equal(rec.status, 'AMBIGUOUS_TIMEOUT', 'Status must not be guessed or marked DISPATCHED');
            assert.equal(rec.isAmbiguous, true, 'isAmbiguous must remain true');
            assert.equal(rec.reconciliationStatus, 'MANUAL_RECONCILIATION_REQUIRED');
            assert.equal(rec.providerMessageId, undefined, 'Provider ID must not be arbitrarily bound');
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 14: Duplicate and Out-of-Order Status Webhooks
    // ─────────────────────────────────────────────────────────────
    it('14. Webhook Idempotency & Out-of-Order Safety: Duplicate events are idempotent and regressive transitions are ignored', async () => {
        const mobile = '919811100014';
        const idempotencyKey = 'durable_rec_order_014';
        const providerMessageId = 'wamid.order.014';

        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'DISPATCHED',
            deliveryStatus: 'sent',
            providerMessageId,
            claimGeneration: 1,
            tenantId: null
        });

        // 1. First 'delivered' event
        const res1 = await WhatsAppService.reconcileWebhookStatus({
            id: providerMessageId,
            status: 'delivered',
            timestamp: '1720000100',
            recipient_id: mobile
        });
        assert.equal(res1.reconciled, true);
        assert.equal(res1.deliveryStatus, 'delivered');

        // 2. Duplicate 'delivered' event (Idempotent replay)
        const resDup = await WhatsAppService.reconcileWebhookStatus({
            id: providerMessageId,
            status: 'delivered',
            timestamp: '1720000105',
            recipient_id: mobile
        });
        assert.equal(resDup.reconciled, true);
        assert.equal(resDup.alreadyReconciled, true);

        // 3. Late out-of-order 'sent' event arriving after 'delivered'
        const resRegressive = await WhatsAppService.reconcileWebhookStatus({
            id: providerMessageId,
            status: 'sent',
            timestamp: '1720000090',
            recipient_id: mobile
        });
        assert.equal(resRegressive.reconciled, false);
        assert.equal(resRegressive.reason, 'REGRESSIVE_STATUS_IGNORED');

        const docAfterSent = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(docAfterSent.deliveryStatus, 'delivered', 'Must remain delivered');

        // 4. Advance to 'read'
        const resRead = await WhatsAppService.reconcileWebhookStatus({
            id: providerMessageId,
            status: 'read',
            timestamp: '1720000120',
            recipient_id: mobile
        });
        assert.equal(resRead.reconciled, true);

        // 5. Late out-of-order 'failed' event arriving after 'read'
        const resFailedAfterRead = await WhatsAppService.reconcileWebhookStatus({
            id: providerMessageId,
            status: 'failed',
            timestamp: '1720000125',
            recipient_id: mobile
        });
        assert.equal(resFailedAfterRead.reconciled, false);
        assert.equal(resFailedAfterRead.reason, 'REGRESSIVE_STATUS_IGNORED');

        const docFinal = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(docFinal.deliveryStatus, 'read', 'Must remain read');
        assert.equal(docFinal.status, 'DISPATCHED');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 15: Failed Delivery Webhook vs Ambiguous Provider Acceptance
    // ─────────────────────────────────────────────────────────────
    it('15. Delivery Failure Webhook: Explicit failure webhook transitions dispatch to FAILED with sanitized error', async () => {
        const mobile = '919811100015';
        const idempotencyKey = 'durable_rec_failed_015';

        // Pre-create ambiguous timeout record
        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });

        // Webhook arrives from Meta indicating message was rejected/failed
        const failureWebhook = {
            id: 'wamid.failed.015',
            status: 'failed',
            timestamp: '1720000200',
            recipient_id: mobile,
            biz_opaque_callback_data: idempotencyKey,
            errors: [{
                code: 131026,
                title: 'Message undeliverable',
                message: 'Receiver is incapable of receiving this message'
            }]
        };

        const res = await WhatsAppService.reconcileWebhookStatus(failureWebhook);
        assert.equal(res.reconciled, true);
        assert.equal(res.status, 'FAILED');
        assert.equal(res.deliveryStatus, 'failed');

        const doc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(doc.status, 'FAILED');
        assert.equal(doc.isAmbiguous, false);
        assert.equal(doc.deliveryStatus, 'failed');
        assert.equal(doc.providerMessageId, 'wamid.failed.015');
        assert.equal(doc.errorDetails.code, 131026);
        assert.equal(doc.reconciliationStatus, 'RECONCILED');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 16: Database Update Failure During Reconciliation
    // ─────────────────────────────────────────────────────────────
    it('16. Database Unavailable Gate: Fails safely with DATABASE_UNAVAILABLE when database is disconnected during reconciliation', async () => {
        const originalReadyState = mongoose.connection.readyState;
        Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

        try {
            const res = await WhatsAppService.reconcileWebhookStatus({
                id: 'wamid.db_down.016',
                status: 'delivered',
                recipient_id: '919811100016'
            });
            assert.equal(res.reconciled, false);
            assert.equal(res.reason, 'DATABASE_UNAVAILABLE');
        } finally {
            delete mongoose.connection.readyState;
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 17: Secret and PII Redaction During Webhook Reconciliation
    // ─────────────────────────────────────────────────────────────
    it('17. Webhook Secret Redaction: Errors containing bearer tokens are sanitized and tenantId is strictly null', async () => {
        const mobile = '919811100017';
        const idempotencyKey = 'durable_rec_redaction_017';

        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'CLAIMED',
            claimGeneration: 1,
            tenantId: null
        });

        // Webhook error containing sensitive API token
        const webhookWithError = {
            id: 'wamid.redact.017',
            status: 'failed',
            timestamp: '1720000300',
            recipient_id: mobile,
            biz_opaque_callback_data: idempotencyKey,
            errors: [{
                code: 190,
                message: 'Invalid authorization header: Bearer EAAG_super_sensitive_live_token_99999999'
            }]
        };

        const res = await WhatsAppService.reconcileWebhookStatus(webhookWithError);
        assert.equal(res.reconciled, true);

        const doc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(doc.tenantId, null, 'tenantId must strictly remain null');

        const serialized = JSON.stringify(doc);
        assert.equal(serialized.includes('EAAG_super_sensitive_live_token'), false, 'Sensitive token must be redacted');
        assert.equal(serialized.includes('[REDACTED]'), true, 'Token must be replaced with [REDACTED]');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 18: Security Check: Rejects Correlation on Recipient or Token Mismatch
    // ─────────────────────────────────────────────────────────────
    it('18. Security Correlation Gate: Rejects correlation when callback token recipient does not match webhook recipient', async () => {
        const mobile = '919811100018';
        const idempotencyKey = 'durable_sec_test_018';

        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });

        // 1. Webhook arrives with valid opaque token BUT different recipient
        const mismatchedWebhook = {
            id: 'wamid.sec.spoof.018',
            status: 'delivered',
            timestamp: '1720000400',
            recipient_id: '919899999999',
            biz_opaque_callback_data: idempotencyKey
        };

        const mismatchRes = await WhatsAppService.reconcileWebhookStatus(mismatchedWebhook);
        assert.equal(mismatchRes.reconciled, false);
        assert.equal(mismatchRes.reason, 'SECURITY_RECIPIENT_MISMATCH');

        // Verify dispatch was NOT bound or updated
        const unchangedDoc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(unchangedDoc.status, 'AMBIGUOUS_TIMEOUT');
        assert.equal(unchangedDoc.isAmbiguous, true);
        assert.equal(unchangedDoc.providerMessageId, undefined);
        assert.equal(unchangedDoc.reconciliationStatus, 'NONE');

        // 2. Webhook arrives with non-existent token and unknown provider message ID
        const unknownTokenWebhook = {
            id: 'wamid.sec.unknown.018',
            status: 'delivered',
            timestamp: '1720000401',
            recipient_id: '919899999999',
            biz_opaque_callback_data: 'non_existent_unregistered_key'
        };

        const unknownRes = await WhatsAppService.reconcileWebhookStatus(unknownTokenWebhook);
        assert.equal(unknownRes.reconciled, false);
        assert.equal(unknownRes.reason, 'NO_MATCHING_DISPATCH');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 19: Manual Reconciliation Safety Gates & Audit Controls
    // ─────────────────────────────────────────────────────────────
    it('19. Manual Reconciliation Safety Gates: Enforces actorId, immutable recipient, collision prevention, and non-regression', async () => {
        const mobile = '919811100019';
        const idempotencyKey = 'durable_manual_rec_019';

        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });

        // 1. Rejects if actorContext is missing (strict authentication required)
        const noAuth = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019'
        });
        assert.equal(noAuth.success, false);
        assert.ok(noAuth.error.includes('AUTHENTICATION_REQUIRED'));

        // 1b. Rejects if caller passes actorId without server-side actorContext (actorId cannot substitute context)
        const actorIdOnly = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            actorId: testUser._id.toString()
        });
        assert.equal(actorIdOnly.success, false);
        assert.ok(actorIdOnly.error.includes('AUTHENTICATION_REQUIRED'));

        // 2. Rejects if actorContext does not resolve to a recognized user in database
        const invalidActor = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            actorContext: { _id: new mongoose.Types.ObjectId() }
        });
        assert.equal(invalidActor.success, false);
        assert.ok(invalidActor.error.includes('AUTHORIZATION_DENIED'));

        // 3. Rejects if actor account is suspended or inactive
        const suspendedUser = await User.create({
            fullName: 'Suspended Admin',
            email: 'suspended_admin@bharatproperties.co',
            password: 'hashed_password_secure',
            role: testUser.role,
            department: 'sales',
            isActive: false,
            status: 'suspended'
        });
        const suspendedRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            actorContext: suspendedUser
        });
        assert.equal(suspendedRes.success, false);
        assert.ok(suspendedRes.error.includes('AUTHORIZATION_DENIED'));

        // 3b. Rejects if actor has an unauthorized ordinary role (e.g. Sales Lead) lacking permission
        const unauthRole = await Role.create({
            name: 'Sales Lead',
            department: 'sales',
            isSystemRole: false
        });
        const salesLeadUser = await User.create({
            fullName: 'Ordinary Sales Lead',
            email: 'saleslead@bharatproperties.co',
            password: 'hashed_password_secure',
            role: unauthRole._id,
            department: 'sales',
            isActive: true,
            status: 'active'
        });
        const unauthRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            actorContext: salesLeadUser
        });
        assert.equal(unauthRes.success, false);
        assert.ok(unauthRes.error.includes('AUTHORIZATION_DENIED'));
        assert.ok(unauthRes.error.includes('lacks explicit \'whatsapp.dispatch.reconcile\' permission'));

        // 3c. Rejects a user with role named 'Super Admin' if it lacks explicit permission (proves role-name grants removed)
        const superAdminRoleNoPerm = await Role.create({
            name: 'Super Admin',
            department: 'sales',
            isSystemRole: true,
            permissions: []
        });
        const superAdminNoPermUser = await User.create({
            fullName: 'Super Admin Without Permission',
            email: 'superadmin_noperm@bharatproperties.co',
            password: 'hashed_password_secure',
            role: superAdminRoleNoPerm._id,
            department: 'sales',
            isActive: true,
            status: 'active'
        });
        const superAdminNoPermRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            actorContext: superAdminNoPermUser
        });
        assert.equal(superAdminNoPermRes.success, false);
        assert.ok(superAdminNoPermRes.error.includes('AUTHORIZATION_DENIED'));
        assert.ok(superAdminNoPermRes.error.includes('lacks explicit \'whatsapp.dispatch.reconcile\' permission'));

        // 3d. Rejects an email on previously hard-coded list lacking explicit permission (proves email grants removed)
        const emailAllowlistUser = await User.create({
            fullName: 'Former Email Allowlist User',
            email: 'bharatproperties570@gmail.com',
            password: 'hashed_password_secure',
            role: unauthRole._id, // ordinary sales lead role without reconcile permission
            department: 'sales',
            isActive: true,
            status: 'active'
        });
        const emailAllowlistRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            actorContext: emailAllowlistUser
        });
        assert.equal(emailAllowlistRes.success, false);
        assert.ok(emailAllowlistRes.error.includes('AUTHORIZATION_DENIED'));
        assert.ok(emailAllowlistRes.error.includes('lacks explicit \'whatsapp.dispatch.reconcile\' permission'));

        // 3e. Rejects client impersonation (actorContext does not match requested actorId)
        const impersonationRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            actorContext: salesLeadUser,
            actorId: testUser._id.toString() // Trying to forge admin ID while authenticated as sales lead!
        });
        assert.equal(impersonationRes.success, false);
        assert.ok(impersonationRes.error.includes('AUTHORIZATION_DENIED'));
        assert.ok(impersonationRes.error.includes('Client actorId does not match authenticated context'));

        // 3f. ServiceContext Security:
        // Case A: Missing configured secret in environment
        const savedEnvSecret = process.env.INTERNAL_SERVICE_SECRET;
        delete process.env.INTERNAL_SERVICE_SECRET;
        const missingEnvRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            serviceContext: {
                isService: true,
                serviceName: 'WhatsAppDispatchReconcilerWorker',
                serviceSecret: 'any_secret'
            }
        });
        assert.equal(missingEnvRes.success, false);
        assert.ok(missingEnvRes.error.includes('AUTHORIZATION_DENIED: Service secret not configured'));

        // Case B: Empty configured secret in environment
        process.env.INTERNAL_SERVICE_SECRET = '   ';
        const emptyEnvRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            serviceContext: {
                isService: true,
                serviceName: 'WhatsAppDispatchReconcilerWorker',
                serviceSecret: 'any_secret'
            }
        });
        assert.equal(emptyEnvRes.success, false);
        assert.ok(emptyEnvRes.error.includes('AUTHORIZATION_DENIED: Service secret not configured'));

        // Case C: Untrusted service name
        process.env.INTERNAL_SERVICE_SECRET = 'secure_internal_dispatch_secret_phase91';
        const untrustedNameRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            serviceContext: {
                isService: true,
                serviceName: 'MaliciousService',
                serviceSecret: 'secure_internal_dispatch_secret_phase91'
            }
        });
        assert.equal(untrustedNameRes.success, false);
        assert.ok(untrustedNameRes.error.includes('AUTHORIZATION_DENIED: Untrusted service name'));

        // Case D: Missing / empty service secret in serviceContext
        const missingSecretRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            serviceContext: {
                isService: true,
                serviceName: 'WhatsAppDispatchReconcilerWorker',
                serviceSecret: ''
            }
        });
        assert.equal(missingSecretRes.success, false);
        assert.ok(missingSecretRes.error.includes('AUTHORIZATION_DENIED: Missing service secret'));

        // Case E: Incorrect service secret (timing-safe rejected)
        const wrongSecretRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            serviceContext: {
                isService: true,
                serviceName: 'WhatsAppDispatchReconcilerWorker',
                serviceSecret: 'wrong_secret_12345'
            }
        });
        assert.equal(wrongSecretRes.success, false);
        assert.ok(wrongSecretRes.error.includes('AUTHORIZATION_DENIED: Invalid service secret'));

        // Restore configured secret
        process.env.INTERNAL_SERVICE_SECRET = savedEnvSecret || 'secure_internal_dispatch_secret_phase91';

        // 4. Rejects if recipient does not match immutable dispatch recipient
        const badRecipient = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            actorContext: testUser,
            actorId: testUser._id.toString(),
            recipient: '919800000000'
        });
        assert.equal(badRecipient.success, false);
        assert.ok(badRecipient.error.includes('SECURITY_RECIPIENT_MISMATCH'));

        // 5. Rejects targetStatus DISPATCHED without providerMessageId
        const noMsgId = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            actorContext: testUser,
            actorId: testUser._id.toString()
        });
        assert.equal(noMsgId.success, false);
        assert.ok(noMsgId.error.includes('PROVIDER_MESSAGE_ID_REQUIRED'));

        // 6. Rejects providerMessageId collision with an existing dispatch
        await WhatsAppDispatch.create({
            idempotencyKey: 'durable_collision_donor_019',
            recipient: '919811100099',
            provider: 'META',
            messageType: 'text',
            status: 'DISPATCHED',
            providerMessageId: 'wamid.existing.collision.019',
            claimGeneration: 1,
            tenantId: null
        });

        const collisionRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.existing.collision.019',
            actorContext: testUser,
            actorId: testUser._id.toString(),
            recipient: mobile
        });
        assert.equal(collisionRes.success, false);
        assert.ok(collisionRes.error.includes('PROVIDER_ID_COLLISION'));

        // 7. Rejects regressive transition from confirmed delivered dispatch
        await WhatsAppDispatch.create({
            idempotencyKey: 'durable_delivered_immutable_019',
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'DISPATCHED',
            deliveryStatus: 'delivered',
            providerMessageId: 'wamid.confirmed.delivered.019',
            claimGeneration: 1,
            tenantId: null
        });

        const regressiveRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey: 'durable_delivered_immutable_019',
            targetStatus: 'FAILED',
            actorContext: testUser,
            actorId: testUser._id.toString(),
            recipient: mobile
        });
        assert.equal(regressiveRes.success, false);
        assert.ok(regressiveRes.error.includes('REGRESSIVE_STATUS_FORBIDDEN'));

        // 8. Successful manual reconciliation with complete audit trail using explicit permission
        const successRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.manual.019',
            actorContext: testUser,
            actorId: testUser._id.toString(),
            reason: 'Verified in Meta Business Manager message log',
            recipient: mobile
        });
        assert.equal(successRes.success, true);
        assert.equal(successRes.reconciled, true);
        assert.equal(successRes.status, 'DISPATCHED');
        assert.equal(successRes.reconciledBy, testUser._id.toString());

        const reconciledDoc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(reconciledDoc.status, 'DISPATCHED');
        assert.equal(reconciledDoc.isAmbiguous, false);
        assert.equal(reconciledDoc.reconciliationStatus, 'RECONCILED');
        assert.equal(reconciledDoc.reconciledBy, testUser._id.toString());
        assert.equal(reconciledDoc.reconciliationReason, 'Verified in Meta Business Manager message log');
        assert.equal(reconciledDoc.tenantId, null);

        // Verify L1 cache is populated and subsequent replay succeeds
        const replay = await WhatsAppService.sendMessage(mobile, 'Manual rec test', { idempotencyKey });
        assert.equal(replay.success, true);
        assert.equal(replay.alreadySent, true);
        assert.equal(replay.messageId, 'wamid.manual.019');

        // 8b. Successful manual reconciliation via role.permissions object map
        const objectPermRole = await Role.create({
            name: 'Operations Manager',
            department: 'sales',
            permissions: { 'whatsapp.dispatch.reconcile': true }
        });
        const moduleUser = await User.create({
            fullName: 'Module Ops User',
            email: 'ops_module@bharatproperties.co',
            password: 'hashed_password_secure',
            role: objectPermRole._id,
            department: 'sales',
            isActive: true,
            status: 'active'
        });
        const moduleKey = 'durable_module_rec_019';
        await WhatsAppDispatch.create({
            idempotencyKey: moduleKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });
        const moduleRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey: moduleKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.module.019',
            actorContext: moduleUser,
            recipient: mobile
        });
        assert.equal(moduleRes.success, true);
        assert.equal(moduleRes.reconciled, true);

        // 9. Legitimate service-to-service reconciliation succeeds through explicit trusted serviceContext and configured secret
        const serviceRecKey = 'durable_service_rec_019';
        await WhatsAppDispatch.create({
            idempotencyKey: serviceRecKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });
        const serviceSuccessRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey: serviceRecKey,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.service.019',
            serviceContext: {
                isService: true,
                serviceName: 'WhatsAppDispatchReconcilerWorker',
                serviceSecret: process.env.INTERNAL_SERVICE_SECRET
            },
            reason: 'Automated reconcile worker recovered from Meta API check',
            recipient: mobile
        });
        assert.equal(serviceSuccessRes.success, true);
        assert.equal(serviceSuccessRes.reconciled, true);
        assert.equal(serviceSuccessRes.reconciledBy, 'service:WhatsAppDispatchReconcilerWorker');

        const serviceDoc = await WhatsAppDispatch.findOne({ idempotencyKey: serviceRecKey }).lean();
        assert.equal(serviceDoc.status, 'DISPATCHED');
        assert.equal(serviceDoc.reconciledBy, 'service:WhatsAppDispatchReconcilerWorker');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 20: Outbound Callback Metadata Inclusion in All Send Methods
    // ─────────────────────────────────────────────────────────────
    it('20. Outbound Callback Metadata Inclusion: biz_opaque_callback_data is placed at root level for text, template, and media payloads', async () => {
        const capturedCalls = [];
        const originalPost = axios.post;
        axios.post = async (url, payload, options) => {
            capturedCalls.push({ url, payload, options });
            return {
                data: {
                    messages: [{ id: `wamid.intercepted.${Date.now()}` }]
                }
            };
        };

        const prevMock = process.env.MOCK_MODE;
        process.env.MOCK_MODE = 'false';

        // Update active integration token so it does not trigger early mock return
        await WhatsAppIntegration.updateOne(
            { _id: activeMetaIntegration._id },
            { $set: { 'credentials.systemUserToken': 'EAAG_valid_inspection_token' } }
        );

        try {
            const config = {
                phoneId: 'phone_durable_01',
                token: 'EAAG_valid_inspection_token'
            };

            // 1. Text Dispatch via _sendViaMeta
            await WhatsAppService._sendViaMeta('919811100020', 'Test text payload', config, {
                idempotencyKey: 'key_outbound_text_020'
            });

            // 2. Template Dispatch via sendTemplate
            await WhatsAppService.sendTemplate('919811100020', 'property_launch_alert', 'en_US', [], {
                idempotencyKey: 'key_outbound_tpl_020'
            });

            // 3. Media Dispatch via _sendViaMeta
            await WhatsAppService._sendViaMeta('919811100020', 'Layout Brochure', config, {
                type: 'document',
                mediaUrl: 'https://cdn.bharatproperties.co/brochures/sector10.pdf',
                filename: 'sector10.pdf',
                idempotencyKey: 'key_outbound_media_020'
            });

            assert.equal(capturedCalls.length, 3, 'All 3 send methods must call Meta messages endpoint');

            // Verify Text Payload
            const textCall = capturedCalls[0];
            assert.equal(textCall.payload.messaging_product, 'whatsapp');
            assert.equal(textCall.payload.type, 'text');
            assert.equal(textCall.payload.to, '919811100020');
            assert.equal(textCall.payload.biz_opaque_callback_data, 'key_outbound_text_020');
            assert.equal(textCall.options.headers['Idempotency-Key'], 'key_outbound_text_020');

            // Verify Template Payload
            const tplCall = capturedCalls[1];
            assert.equal(tplCall.payload.messaging_product, 'whatsapp');
            assert.equal(tplCall.payload.type, 'template');
            assert.equal(tplCall.payload.to, '919811100020');
            assert.equal(tplCall.payload.biz_opaque_callback_data, 'key_outbound_tpl_020');
            assert.equal(tplCall.options.headers['Idempotency-Key'], 'key_outbound_tpl_020');

            // Verify Media Payload
            const mediaCall = capturedCalls[2];
            assert.equal(mediaCall.payload.messaging_product, 'whatsapp');
            assert.equal(mediaCall.payload.type, 'document');
            assert.equal(mediaCall.payload.to, '919811100020');
            assert.equal(mediaCall.payload.biz_opaque_callback_data, 'key_outbound_media_020');
            assert.equal(mediaCall.options.headers['Idempotency-Key'], 'key_outbound_media_020');
        } finally {
            axios.post = originalPost;
            process.env.MOCK_MODE = prevMock;
            await WhatsAppIntegration.updateOne(
                { _id: activeMetaIntegration._id },
                { $set: { 'credentials.systemUserToken': 'EAAG_test_durable_secret_token' } }
            );
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 21: Atomic Webhook Reconcile Concurrency & Uniqueness Collision Gate
    // ─────────────────────────────────────────────────────────────
    it('21. Atomic Webhook Reconcile Concurrency & Uniqueness Collision Gate: Monotonic query prevents concurrent race regression and MongoDB sparse unique index rejects duplicate provider IDs', async () => {
        const mobile = '919811100021';
        const idempotencyKey = 'durable_atomic_race_021';
        const providerMessageId = 'wamid.atomic.race.021';

        // 1. Pre-seed dispatch in AMBIGUOUS_TIMEOUT
        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });

        // 2. Simulate concurrent arrival of 'delivered' webhook and late out-of-order 'sent' webhook
        // Reconcile 'delivered' first
        const deliveredWebhook = {
            id: providerMessageId,
            status: 'delivered',
            timestamp: '1720000500',
            recipient_id: mobile,
            biz_opaque_callback_data: idempotencyKey
        };
        const deliveredRes = await WhatsAppService.reconcileWebhookStatus(deliveredWebhook);
        assert.equal(deliveredRes.reconciled, true);
        assert.equal(deliveredRes.deliveryStatus, 'delivered');

        // Now late out-of-order 'sent' webhook arrives for the same dispatch
        const lateSentWebhook = {
            id: providerMessageId,
            status: 'sent',
            timestamp: '1720000490', // earlier timestamp
            recipient_id: mobile,
            biz_opaque_callback_data: idempotencyKey
        };
        const lateSentRes = await WhatsAppService.reconcileWebhookStatus(lateSentWebhook);
        assert.equal(lateSentRes.reconciled, false);
        assert.equal(lateSentRes.reason, 'REGRESSIVE_STATUS_IGNORED');

        // Document must retain 'delivered' deliveryStatus
        const postDoc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(postDoc.deliveryStatus, 'delivered', 'Atomic guard must prevent regressing delivered to sent');

        // 3. Test MongoDB sparse unique index rejects duplicate providerMessageId across distinct dispatches
        await assert.rejects(
            async () => {
                await WhatsAppDispatch.create({
                    idempotencyKey: 'durable_unique_collision_021',
                    recipient: '919811100099',
                    provider: 'META',
                    messageType: 'text',
                    status: 'DISPATCHED',
                    providerMessageId: providerMessageId, // DUPLICATE providerMessageId!
                    claimGeneration: 1,
                    tenantId: null
                });
            },
            (err) => err.code === 11000,
            'MongoDB sparse unique index must reject duplicate providerMessageId with E11000'
        );
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 22: Concurrent Operator Manual Reconciliation CAS Race
    // ─────────────────────────────────────────────────────────────
    it('22. Manual Reconciliation CAS Concurrency: Two simultaneous manual reconciliation attempts against the same ambiguous record resolve deterministically without corruption', async () => {
        const mobile = '919811100022';
        const idempotencyKey = 'durable_cas_race_022';

        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });

        // Use a controlled synchronization barrier to force genuine overlap
        let releaseBarrier;
        const barrier = new Promise(resolve => { releaseBarrier = resolve; });

        const task1 = (async () => {
            await barrier;
            return await WhatsAppService.manualReconcileDispatch({
                idempotencyKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.race.op1.022',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Operator 1 confirmed via Meta log',
                recipient: mobile
            });
        })();

        const task2 = (async () => {
            await barrier;
            return await WhatsAppService.manualReconcileDispatch({
                idempotencyKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.race.op2.022',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Operator 2 confirmed via Meta log',
                recipient: mobile
            });
        })();

        releaseBarrier();
        const [op1, op2] = await Promise.all([task1, task2]);

        // Exactly one operator must succeed in atomically modifying the record
        const successes = [op1, op2].filter(r => r.success && !r.alreadyReconciled);
        const conflicts = [op1, op2].filter(r => !r.success && r.error.includes('STATE_TRANSITION_CONFLICT'));

        assert.equal(successes.length, 1, 'Exactly one concurrent manual reconciliation must succeed');
        assert.equal(conflicts.length, 1, 'The competing reconciliation must receive explicit STATE_TRANSITION_CONFLICT');

        const winningResult = successes[0];
        const finalDoc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(finalDoc.status, 'DISPATCHED');
        assert.equal(finalDoc.providerMessageId, winningResult.providerMessageId);
        assert.equal(finalDoc.reconciliationStatus, 'RECONCILED');
        assert.equal(finalDoc.isAmbiguous, false);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 23: Operator Racing Against Incoming Webhook Status Update
    // ─────────────────────────────────────────────────────────────
    it('23. Operator vs Webhook Race: Confirmed delivery webhook arriving concurrently blocks subsequent FAILED manual reconciliation', async () => {
        const mobile = '919811100023';
        const idempotencyKey = 'durable_op_vs_wh_023';
        const providerMessageId = 'wamid.op_vs_wh.023';

        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'AMBIGUOUS_TIMEOUT',
            isAmbiguous: true,
            claimGeneration: 1,
            tenantId: null
        });

        // Use a controlled synchronization barrier to force genuine overlap
        let releaseBarrier;
        const barrier = new Promise(resolve => { releaseBarrier = resolve; });

        const webhookTask = (async () => {
            await barrier;
            return await WhatsAppService.reconcileWebhookStatus({
                id: providerMessageId,
                status: 'delivered',
                timestamp: '1720000600',
                recipient_id: mobile,
                biz_opaque_callback_data: idempotencyKey
            });
        })();

        const operatorTask = (async () => {
            await barrier;
            return await WhatsAppService.manualReconcileDispatch({
                idempotencyKey,
                targetStatus: 'FAILED',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Operator attempting failed reconciliation during webhook transit',
                recipient: mobile
            });
        })();

        // Release barrier simultaneously so both operations hit MongoDB in parallel
        releaseBarrier();
        const [whResult, opResult] = await Promise.all([webhookTask, operatorTask]);

        // CRITICAL INVARIANT: A confirmed delivered message must NEVER end up marked FAILED
        const finalDoc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.notEqual(finalDoc.status, 'FAILED', 'Dispatch must never be FAILED if delivered was confirmed');
        assert.equal(finalDoc.status, 'DISPATCHED', 'Dispatch must be DISPATCHED once delivered');
        assert.equal(finalDoc.deliveryStatus, 'delivered', 'Delivery status must be delivered');
        assert.equal(finalDoc.isAmbiguous, false);

        // One of the operations must have safely resolved conflict
        if (whResult.reconciled) {
            assert.equal(opResult.success, false, 'Operator FAILED update must be rejected when webhook delivered');
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 24: Two Dispatches Racing to Bind the Same Provider Message ID
    // ─────────────────────────────────────────────────────────────
    it('24. Unique Provider ID Race: Two distinct dispatches racing to bind identical providerMessageId are rejected by sparse unique constraint', async () => {
        const mobile1 = '919811100024';
        const mobile2 = '919811100025';
        const key1 = 'durable_unique_race_024a';
        const key2 = 'durable_unique_race_024b';
        const sharedMsgId = 'wamid.shared.race.id.024';

        await WhatsAppDispatch.create([
            {
                idempotencyKey: key1,
                recipient: mobile1,
                provider: 'META',
                messageType: 'text',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                claimGeneration: 1,
                tenantId: null
            },
            {
                idempotencyKey: key2,
                recipient: mobile2,
                provider: 'META',
                messageType: 'text',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                claimGeneration: 1,
                tenantId: null
            }
        ]);

        // Use a controlled synchronization barrier to force genuine overlap
        let releaseBarrier;
        const barrier = new Promise(resolve => { releaseBarrier = resolve; });

        const task1 = (async () => {
            await barrier;
            return await WhatsAppService.manualReconcileDispatch({
                idempotencyKey: key1,
                targetStatus: 'DISPATCHED',
                providerMessageId: sharedMsgId,
                actorContext: testUser,
                actorId: testUser._id.toString(),
                recipient: mobile1
            });
        })();

        const task2 = (async () => {
            await barrier;
            return await WhatsAppService.manualReconcileDispatch({
                idempotencyKey: key2,
                targetStatus: 'DISPATCHED',
                providerMessageId: sharedMsgId,
                actorContext: testUser,
                actorId: testUser._id.toString(),
                recipient: mobile2
            });
        })();

        releaseBarrier();
        const [res1, res2] = await Promise.all([task1, task2]);

        const successes = [res1, res2].filter(r => r.success);
        const collisions = [res1, res2].filter(r => !r.success && r.error.includes('PROVIDER_ID_COLLISION'));

        assert.equal(successes.length, 1, 'Only one dispatch can claim the unique providerMessageId');
        assert.equal(collisions.length, 1, 'The competing dispatch must receive PROVIDER_ID_COLLISION');

        const boundDoc = await WhatsAppDispatch.findOne({ providerMessageId: sharedMsgId }).lean();
        assert.ok(boundDoc);
        assert.ok([key1, key2].includes(boundDoc.idempotencyKey));
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 25: Multi-Webhook Concurrent Storm Monotonic Progression & Stale Event Protection
    // ─────────────────────────────────────────────────────────────
    it('25. Multi-Webhook Concurrent Storm: Concurrent sent, delivered, read, and late events preserve monotonic progression without regression', async () => {
        const mobile = '919811100026';
        const idempotencyKey = 'durable_storm_025';
        const providerMessageId = 'wamid.storm.025';

        await WhatsAppDispatch.create({
            idempotencyKey,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'CLAIMED',
            claimGeneration: 1,
            tenantId: null
        });

        // Storm of concurrent lifecycle webhooks: sent, delivered, read, and out-of-order duplicates
        const webhooks = [
            { id: providerMessageId, status: 'sent', timestamp: '1720000700', recipient_id: mobile, biz_opaque_callback_data: idempotencyKey },
            { id: providerMessageId, status: 'delivered', timestamp: '1720000705', recipient_id: mobile, biz_opaque_callback_data: idempotencyKey },
            { id: providerMessageId, status: 'read', timestamp: '1720000710', recipient_id: mobile, biz_opaque_callback_data: idempotencyKey },
            { id: providerMessageId, status: 'sent', timestamp: '1720000699', recipient_id: mobile, biz_opaque_callback_data: idempotencyKey }, // Stale duplicate sent
            { id: providerMessageId, status: 'delivered', timestamp: '1720000704', recipient_id: mobile, biz_opaque_callback_data: idempotencyKey } // Stale duplicate delivered
        ];

        // Controlled synchronization barrier to force all webhooks in the storm to hit MongoDB concurrently
        let releaseBarrier;
        const barrier = new Promise(resolve => { releaseBarrier = resolve; });

        const tasks = webhooks.map(wh => (async () => {
            await barrier;
            return await WhatsAppService.reconcileWebhookStatus(wh);
        })());

        releaseBarrier();
        await Promise.all(tasks);

        // Final state must reflect the monotonic invariant: status monotonically advanced to 'read'
        const docAfterStorm = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(docAfterStorm.deliveryStatus, 'read', 'Final state in storm must be monotonically preserved as read');
        assert.equal(docAfterStorm.status, 'DISPATCHED', 'Dispatch status must remain DISPATCHED once read');
        assert.equal(docAfterStorm.tenantId, null);

        // Subsequent late/stale 'failed' webhook cannot regress confirmed read status
        const lateFailedWebhook = {
            id: providerMessageId,
            status: 'failed',
            timestamp: '1720000720',
            recipient_id: mobile,
            biz_opaque_callback_data: idempotencyKey,
            errors: [{ code: 131053, message: 'Delayed out-of-order failure message' }]
        };
        const lateFailedRes = await WhatsAppService.reconcileWebhookStatus(lateFailedWebhook);
        assert.equal(lateFailedRes.reconciled, false);
        assert.equal(lateFailedRes.reason, 'REGRESSIVE_STATUS_IGNORED', 'Late failure must be safely ignored as regressive');

        const finalDoc = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        assert.equal(finalDoc.deliveryStatus, 'read', 'Delivery status must remain read');
        assert.equal(finalDoc.status, 'DISPATCHED', 'Dispatch status must remain DISPATCHED');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 26: State-Transition Invariants, Ambiguity Bypasses & Provider Rebinding Guards
    // ─────────────────────────────────────────────────────────────
    it('26. State-Transition Invariants & Rebinding Gates: Enforces allowed source statuses, prevents ambiguity bypass, and rejects provider ID rebinding', async () => {
        const mobile = '919811100027';

        // 1. Ambiguity flag on DISPATCHED record CANNOT bypass allowed source status to transition to FAILED
        const keyDispatched = 'durable_dispatched_ambiguous_026';
        await WhatsAppDispatch.create({
            idempotencyKey: keyDispatched,
            recipient: mobile,
            provider: 'META',
            messageType: 'text',
            status: 'DISPATCHED',
            providerMessageId: 'wamid.confirmed.026',
            isAmbiguous: true, // Flag is true, but status is DISPATCHED!
            claimGeneration: 1,
            tenantId: null
        });

        const bypassAttempt = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey: keyDispatched,
            targetStatus: 'FAILED',
            actorContext: testUser,
            actorId: testUser._id.toString(),
            recipient: mobile
        });
        assert.equal(bypassAttempt.success, false);
        assert.ok(bypassAttempt.error.includes('INVALID_SOURCE_STATUS'), 'Ambiguity flag must not allow DISPATCHED record to transition to FAILED');

        // Verify status remained DISPATCHED
        const docBypass = await WhatsAppDispatch.findOne({ idempotencyKey: keyDispatched }).lean();
        assert.equal(docBypass.status, 'DISPATCHED');

        // 2. Cannot rebind a dispatch with an already confirmed providerMessageId to a different providerMessageId
        const rebindAttempt = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey: keyDispatched,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.tampered_new_id.026', // Different from confirmed 'wamid.confirmed.026'
            actorContext: testUser,
            actorId: testUser._id.toString(),
            recipient: mobile
        });
        assert.equal(rebindAttempt.success, false);
        assert.ok(rebindAttempt.error.includes('PROVIDER_ID_REBIND_FORBIDDEN'), 'Confirmed provider message ID cannot be rebound to another ID');

        // 3. Webhook opaque correlation cannot rebind confirmed providerMessageId to a different providerMessageId
        const rebindWebhook = {
            id: 'wamid.tampered_webhook_id.026', // Different providerMessageId
            status: 'delivered',
            timestamp: '1720000800',
            recipient_id: mobile,
            biz_opaque_callback_data: keyDispatched
        };
        const whRebindRes = await WhatsAppService.reconcileWebhookStatus(rebindWebhook);
        assert.equal(whRebindRes.reconciled, false);
        assert.equal(whRebindRes.reason, 'PROVIDER_ID_REBIND_FORBIDDEN');

        // 4. Idempotent re-reconciliation with matching state and matching providerMessageId returns alreadyReconciled: true
        const idempotentRes = await WhatsAppService.manualReconcileDispatch({
            idempotencyKey: keyDispatched,
            targetStatus: 'DISPATCHED',
            providerMessageId: 'wamid.confirmed.026', // Exact match
            actorContext: testUser,
            actorId: testUser._id.toString(),
            recipient: mobile
        });
        assert.equal(idempotentRes.success, true);
        assert.equal(idempotentRes.alreadyReconciled, true);
        assert.equal(idempotentRes.status, 'DISPATCHED');
    });
});
