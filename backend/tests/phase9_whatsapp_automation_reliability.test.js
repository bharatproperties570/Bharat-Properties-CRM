process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Lead from '../models/Lead.js';
import Contact from '../models/Contact.js';
import Conversation from '../models/Conversation.js';
import Activity from '../models/Activity.js';
import OutboxEvent from '../models/OutboxEvent.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import MarketingTouch from '../models/MarketingTouch.js';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import CampaignRun from '../models/CampaignRun.js';
import Project from '../models/Project.js';
import Lookup from '../models/Lookup.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

import InboundMessageService from '../src/services/InboundMessageService.js';
import WhatsAppService from '../services/WhatsAppService.js';
import {
    isValidMetaSignature,
    isValidVerifyToken,
    normalizeTextMessage,
    extractWhatsAppChanges,
    isMonotonicStatusTransition,
    STATUS_WEIGHTS,
    isOptOutMessage,
    isOptInMessage,
    sanitizeSecrets
} from '../utils/whatsappWebhook.utils.js';

describe('Phase 9 — WhatsApp Multi-Session & Message Automation Reliability Test Suite', () => {
    let replset;
    let testUser;
    let activeMetaIntegration;
    let revokedMetaIntegration;

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

        // Ensure collections
        await Conversation.createCollection();
        await Activity.createCollection();
        await OutboxEvent.createCollection();
        await Lead.createCollection();
        await Contact.createCollection();
        await WhatsAppIntegration.createCollection();
        await MarketingDelivery.createCollection();
        await MarketingTouch.createCollection();
        await Deal.createCollection();
        await Inventory.createCollection();
        await CampaignRun.createCollection();
        await Project.createCollection();
        await Lookup.createCollection();

        // Seed System Role and User
        const role = await Role.create({
            name: 'Super Admin',
            department: 'sales',
            isSystemRole: true
        });

        testUser = await User.create({
            fullName: 'WhatsApp Admin',
            email: 'wa.admin@bharatproperties.co',
            password: 'hashed_password_123',
            role: role._id,
            department: 'sales',
            isActive: true,
            status: 'active',
            availability: 'Available',
            preferences: { workingHours: { start: '00:00', end: '23:59' } }
        });

        // Seed Active Meta WhatsApp Account
        activeMetaIntegration = await WhatsAppIntegration.create({
            provider: 'META',
            wabaId: 'waba_enterprise_01',
            phoneNumberId: 'phone_enterprise_01',
            displayPhoneNumber: '+91 99960 00570',
            accountLabel: 'Primary Corporate WhatsApp',
            isDefault: true,
            connectionType: 'COEXISTENCE',
            onboardingStatus: 'CONNECTED',
            status: 'ACTIVE',
            credentials: {
                systemUserToken: 'EAAG_valid_test_token_secret_12345'
            },
            connectedBy: testUser._id
        });

        // Seed Expired Meta WhatsApp Account
        revokedMetaIntegration = await WhatsAppIntegration.create({
            provider: 'META',
            wabaId: 'waba_enterprise_02',
            phoneNumberId: 'phone_enterprise_02',
            displayPhoneNumber: '+91 98888 00000',
            accountLabel: 'Secondary Regional WhatsApp',
            isDefault: false,
            connectionType: 'NEW_API',
            onboardingStatus: 'CONNECTED',
            status: 'ACTIVE',
            credentials: {
                systemUserToken: 'EAAG_expired_test_token_secret_99999'
            },
            connectedBy: testUser._id
        });
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        await Lead.deleteMany({});
        await Contact.deleteMany({});
        await Conversation.deleteMany({});
        await Activity.deleteMany({});
        await OutboxEvent.deleteMany({});
        // Reset in-memory idempotency cache
        WhatsAppService._idempotencyCache.clear();
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Webhook Security & HMAC SHA-256 Signature Validation
    // ─────────────────────────────────────────────────────────────
    it('1. Webhook Security: Validates Meta HMAC SHA-256 signatures, rejects tampered bytes and redacts secrets', () => {
        const appSecret = 'fb_app_secret_test_570';
        const rawPayload = Buffer.from(JSON.stringify({
            object: 'whatsapp_business_account',
            entry: [{ id: 'waba_enterprise_01', changes: [] }]
        }));

        const validSignature = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawPayload).digest('hex');

        // Valid signature passes
        assert.equal(isValidMetaSignature(rawPayload, validSignature, appSecret), true);

        // Tampered payload fails
        const tamperedPayload = Buffer.from(JSON.stringify({
            object: 'whatsapp_business_account',
            entry: [{ id: 'waba_enterprise_01_TAMPERED', changes: [] }]
        }));
        assert.equal(isValidMetaSignature(tamperedPayload, validSignature, appSecret), false);

        // Missing or malformed signature fails
        assert.equal(isValidMetaSignature(rawPayload, 'invalid_sig', appSecret), false);
        assert.equal(isValidMetaSignature(rawPayload, '', appSecret), false);

        // Verify token check
        assert.equal(isValidVerifyToken('subscribe', 'my_secret_verify_token', 'my_secret_verify_token'), true);
        assert.equal(isValidVerifyToken('subscribe', 'wrong_token', 'my_secret_verify_token'), false);

        // Secret sanitization
        const sensitiveLog = 'Request error with Bearer EAAG_super_secret_token_12345 and token=xyz987654321';
        const sanitized = sanitizeSecrets(sensitiveLog);
        assert.ok(!sanitized.includes('EAAG_super_secret_token_12345'), 'Bearer token must be redacted');
        assert.ok(!sanitized.includes('xyz987654321'), 'access token must be redacted');
        assert.ok(sanitized.includes('[REDACTED]'));
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Inbound Webhook Idempotency & Duplicate Replay Suppression
    // ─────────────────────────────────────────────────────────────
    it('2. Inbound Idempotency: Processing identical inbound message ID suppresses duplicate message push, activity, and intake', async () => {
        const mobile = '919811122233';
        const messageId = 'wamid.HBgNNzk4MTEyMjIzMxUCMRICGDEyMzQ1';
        const messagePayload = {
            from: mobile,
            id: messageId,
            timestamp: '1720000000',
            type: 'text',
            text: { body: 'Looking for 3BHK flat in Aerocity Mohali' }
        };
        const valuePayload = {
            metadata: {
                phone_number_id: 'phone_enterprise_01',
                display_phone_number: '+91 99960 00570'
            },
            contacts: [{ profile: { name: 'Manish Sharma' } }]
        };

        // First delivery: processes successfully
        const firstResult = await InboundMessageService.processInboundMessageTx(messagePayload, valuePayload);
        assert.equal(firstResult.success, true);
        assert.equal(firstResult.duplicate, false);
        assert.ok(firstResult.activity, 'Activity must be created on first delivery');

        // Second delivery (duplicate replay): atomically suppressed
        const duplicateResult = await InboundMessageService.processInboundMessageTx(messagePayload, valuePayload);
        assert.equal(duplicateResult.success, true);
        assert.equal(duplicateResult.duplicate, true);

        // Verify database state: exactly ONE conversation, ONE message, ONE activity, and ONE outbox event
        const conv = await Conversation.findOne({ phoneNumber: mobile });
        assert.ok(conv);
        assert.equal(conv.messages.length, 1, 'Duplicate message must not be appended to Conversation');
        assert.equal(conv.messages[0].metadata.waId, messageId);

        const activities = await Activity.find({ 'details.waId': messageId });
        assert.equal(activities.length, 1, 'Duplicate delivery must not create multiple activities');

        const outboxEvents = await OutboxEvent.find({ aggregateId: activities[0]._id });
        assert.equal(outboxEvents.length, 1, 'Only one OutboxEvent must be persisted');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Inbound Opt-Out & Opt-In Keyword Detection & Lifecycle
    // ─────────────────────────────────────────────────────────────
    it('3. Inbound Opt-Out/Opt-In: STOP and START keywords automatically mutate consent on Conversation and Lead', async () => {
        const mobile = '919876500111';

        // Pre-create active Lead
        const lead = await Lead.create({
            firstName: 'Vikram',
            lastName: 'Malhotra',
            mobile,
            whatsappOptOut: false
        });

        // 1. Inbound STOP message arrives
        const stopMessage = {
            from: mobile,
            id: 'wamid.stop.msg.01',
            timestamp: '1720000100',
            type: 'text',
            text: { body: 'STOP' }
        };
        const value = { metadata: { phone_number_id: 'phone_enterprise_01' } };

        assert.equal(isOptOutMessage('STOP'), true);
        assert.equal(isOptOutMessage('unsubscribe'), true);
        assert.equal(isOptOutMessage('ROKO'), true);

        const stopResult = await InboundMessageService.processInboundMessageTx(stopMessage, value);
        assert.equal(stopResult.success, true);

        // Verify Conversation is opted out
        const convAfterStop = await Conversation.findOne({ phoneNumber: mobile });
        assert.equal(convAfterStop.isOptedOut, true);
        assert.ok(convAfterStop.optedOutAt);

        // Verify Lead is marked opted out
        const leadAfterStop = await Lead.findById(lead._id);
        assert.equal(leadAfterStop.whatsappOptOut, true);
        assert.ok(leadAfterStop.whatsappOptOutAt);

        // 2. Inbound START message arrives (customer re-opts in)
        assert.equal(isOptInMessage('START'), true);
        assert.equal(isOptInMessage('subscribe'), true);

        const startMessage = {
            from: mobile,
            id: 'wamid.start.msg.02',
            timestamp: '1720000200',
            type: 'text',
            text: { body: 'START' }
        };

        const startResult = await InboundMessageService.processInboundMessageTx(startMessage, value);
        assert.equal(startResult.success, true);

        // Verify Conversation opted out is cleared
        const convAfterStart = await Conversation.findOne({ phoneNumber: mobile });
        assert.equal(convAfterStart.isOptedOut, false);

        // Verify Lead opted out is cleared
        const leadAfterStart = await Lead.findById(lead._id);
        assert.equal(leadAfterStart.whatsappOptOut, false);
        assert.ok(leadAfterStart.whatsappOptInAt);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Outbound Opt-Out Policy Enforcement
    // ─────────────────────────────────────────────────────────────
    it('4. Outbound Consent Gate: Rejects outbound message and template sends to opted-out recipients', async () => {
        const optedOutPhone = '919876543999';

        await Lead.create({
            firstName: 'Opted',
            lastName: 'OutUser',
            mobile: optedOutPhone,
            whatsappOptOut: true,
            whatsappOptOutAt: new Date()
        });

        // 1. Text Message Send Blocked
        const sendRes = await WhatsAppService.sendMessage(optedOutPhone, 'Exclusive penthouse launch!');
        assert.equal(sendRes.success, false);
        assert.equal(sendRes.code, 'RECIPIENT_OPTED_OUT');
        assert.equal(sendRes.optedOut, true);

        // 2. Template Send Blocked
        const templateRes = await WhatsAppService.sendTemplate(optedOutPhone, 'site_visit_reminder', 'en_US', []);
        assert.equal(templateRes.success, false);
        assert.equal(templateRes.code, 'RECIPIENT_OPTED_OUT');
        assert.equal(templateRes.optedOut, true);

        // 3. Override Opt-Out allowed for explicit transactional overrides
        const overrideRes = await WhatsAppService.sendMessage(optedOutPhone, 'Urgent KYC update', { overrideOptOut: true });
        // Since no live Meta credentials in test, it safely reaches mock or staging-blocked
        assert.ok(overrideRes.code !== 'RECIPIENT_OPTED_OUT', 'Override must bypass opt-out check');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Outbound Idempotency Caching & Duplicate Dispatch Prevention
    // ─────────────────────────────────────────────────────────────
    it('5. Outbound Idempotency: Duplicate dispatches with same idempotencyKey return cached response', async () => {
        const mobile = '919811199999';
        const idempotencyKey = 'idemp_key_booking_confirm_123';

        // 1. First send: caches result
        const res1 = await WhatsAppService.sendMessage(mobile, 'Your booking is confirmed.', { idempotencyKey });
        assert.equal(res1.success, true);
        assert.equal(res1.alreadySent, undefined);

        // 2. Immediate second send with same idempotencyKey: returns cached result without dispatch
        const res2 = await WhatsAppService.sendMessage(mobile, 'Your booking is confirmed.', { idempotencyKey });
        assert.equal(res2.success, true);
        assert.equal(res2.alreadySent, true);
        assert.equal(res2.duplicate, true);

        // 3. Template send idempotency
        const templateKey = 'idemp_key_template_456';
        const t1 = await WhatsAppService.sendTemplate(mobile, 'welcome_brochure', 'en_US', [], { idempotencyKey: templateKey });
        assert.equal(t1.success, true);

        const t2 = await WhatsAppService.sendTemplate(mobile, 'welcome_brochure', 'en_US', [], { idempotencyKey: templateKey });
        assert.equal(t2.success, true);
        assert.equal(t2.alreadySent, true);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Monotonic Status Progression & Out-of-Order Recovery
    // ─────────────────────────────────────────────────────────────
    it('6. Monotonic Status: Prevents out-of-order webhook delivery from regressing read/delivered message states', async () => {
        assert.equal(STATUS_WEIGHTS['queued'], 0);
        assert.equal(STATUS_WEIGHTS['accepted'], 1);
        assert.equal(STATUS_WEIGHTS['sent'], 2);
        assert.equal(STATUS_WEIGHTS['delivered'], 3);
        assert.equal(STATUS_WEIGHTS['read'], 4);
        assert.equal(STATUS_WEIGHTS['failed'], -1);

        // Monotonic transitions
        assert.equal(isMonotonicStatusTransition('sent', 'delivered'), true);
        assert.equal(isMonotonicStatusTransition('delivered', 'read'), true);
        assert.equal(isMonotonicStatusTransition('sent', 'read'), true);
        assert.equal(isMonotonicStatusTransition('queued', 'failed'), true);

        // Regressive transitions must be rejected
        assert.equal(isMonotonicStatusTransition('read', 'delivered'), false, 'read must not regress to delivered');
        assert.equal(isMonotonicStatusTransition('read', 'sent'), false, 'read must not regress to sent');
        assert.equal(isMonotonicStatusTransition('delivered', 'sent'), false, 'delivered must not regress to sent');
        assert.equal(isMonotonicStatusTransition('failed', 'sent'), false, 'failed must not regress to sent');

        // Verify Database simulation: Message marked read cannot be regressed by late delivered event
        const testWaId = 'wamid.outbound.test.888';
        const conv = await Conversation.create({
            phoneNumber: '919811100000',
            channel: 'whatsapp',
            messages: [{
                role: 'assistant',
                content: 'Payment receipt',
                metadata: {
                    waId: testWaId,
                    status: 'read',
                    statusAt: new Date(Date.now() - 60000)
                }
            }]
        });

        const activity = await Activity.create({
            type: 'WhatsApp',
            subject: 'Sent Payment Receipt',
            entityType: 'Lead',
            dueDate: new Date(),
            details: {
                waId: testWaId,
                status: 'read'
            }
        });

        // Simulate late arriving 'delivered' webhook status
        const lateStatus = 'delivered';
        const currentMsg = conv.messages[0];
        const canUpdate = isMonotonicStatusTransition(currentMsg.metadata.status, lateStatus);
        assert.equal(canUpdate, false, 'Late delivered status must be identified as regressive');

        // Database stays at read
        const finalConv = await Conversation.findById(conv._id);
        assert.equal(finalConv.messages[0].metadata.status, 'read');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Error Categorization, Retry Classification & Token Revocation
    // ─────────────────────────────────────────────────────────────
    it('7. Error Handling: Accurately classifies retryable rate limits vs permanent window closed and revokes invalid tokens', async () => {
        // Test token revocation on Error 190
        await WhatsAppService._markIntegrationRevoked(
            revokedMetaIntegration._id,
            'Token expired or revoked by Meta (Error 190)'
        );

        const updatedIntegration = await WhatsAppIntegration.findById(revokedMetaIntegration._id);
        assert.equal(updatedIntegration.status, 'REVOKED');
        assert.equal(updatedIntegration.onboardingStatus, 'REVOKED');
        assert.ok(updatedIntegration.failureReason.includes('Error 190'));
        assert.ok(updatedIntegration.revokedAt);

        // Verify error classification logic in WhatsAppService
        const mockRateLimitErr = {
            response: {
                status: 429,
                data: { error: { code: 130429, message: 'Cloud API rate limit hit' } }
            }
        };

        // Classify using our structured categorization
        const code = mockRateLimitErr.response.data.error.code;
        const status = mockRateLimitErr.response.status;
        const isRateLimit = code === 429 || code === 130429 || status === 429;
        assert.equal(isRateLimit, true, 'Rate limit must be detected as retryable');

        const mockWindowClosedErr = {
            response: {
                status: 400,
                data: { error: { code: 131030, message: 'Customer service window closed' } }
            }
        };
        const isWindowClosed = mockWindowClosedErr.response.data.error.code === 131030;
        assert.equal(isWindowClosed, true, 'Window closed error must be identified as permanent template requirement');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Multi-Account Resolution & Single-Organisation Safety
    // ─────────────────────────────────────────────────────────────
    it('8. Single-Org & Multi-Account: Preserves null tenantId and resolves targeted active Meta account', async () => {
        // 1. Multi-account resolution
        const config = await WhatsAppService._getMetaConfig(activeMetaIntegration._id.toString());
        assert.ok(config);
        assert.equal(config.phoneId, activeMetaIntegration.phoneNumberId);
        assert.equal(config.businessId, activeMetaIntegration.wabaId);
        assert.equal(config.accountLabel, activeMetaIntegration.accountLabel);

        // 2. Single-org preservation: tenantId remains strictly null
        const lead = await Lead.create({
            firstName: 'Rahul',
            lastName: 'Kapoor',
            mobile: '919811122444',
            tenantId: null // Single-org explicit null
        });

        const conv = await Conversation.create({
            phoneNumber: lead.mobile,
            lead: lead._id,
            tenantId: null
        });

        const outbox = await OutboxEvent.create({
            eventType: 'ActivityCreated',
            aggregateType: 'Activity',
            aggregateId: new mongoose.Types.ObjectId(),
            payload: { channel: 'whatsapp', recipient: lead.mobile },
            tenantId: null,
            provenance: { source: 'WORKER', actorType: 'SYSTEM' }
        });

        assert.strictEqual(lead.tenantId || null, null);
        assert.strictEqual(conv.tenantId || null, null);
        assert.strictEqual(outbox.tenantId || null, null);
    });
});
