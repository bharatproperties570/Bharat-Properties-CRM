process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import WhatsAppService from '../services/WhatsAppService.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import SystemSetting from '../models/SystemSetting.js';
import Lead from '../models/Lead.js';
import Contact from '../models/Contact.js';
import Conversation from '../models/Conversation.js';

describe('Opt-Out Fail-Closed Verification Suite', () => {
    let mongod;

    before(async () => {
        mongod = await MongoMemoryServer.create();
        await mongoose.connect(mongod.getUri(), { autoIndex: false });
        await Lead.createCollection();
        await Contact.createCollection();
        await Conversation.createCollection();
        await WhatsAppIntegration.createCollection();
        await SystemSetting.createCollection();

        await WhatsAppIntegration.create({
            provider: 'META',
            wabaId: 'waba_optout_01',
            phoneNumberId: 'phone_optout_01',
            displayPhoneNumber: '+91 99960 00570',
            accountLabel: 'Primary OptOut WhatsApp',
            isDefault: true,
            connectionType: 'COEXISTENCE',
            onboardingStatus: 'CONNECTED',
            status: 'ACTIVE',
            credentials: {
                systemUserToken: 'EAAG_test_optout_secret_token'
            }
        });
    });

    after(async () => {
        await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });

    it('1. Disconnected MongoDB: isRecipientOptedOut fails closed (returns true)', async () => {
        const mobile = '919811100091';
        const originalReadyState = mongoose.connection.readyState;
        Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

        try {
            const isOptedOut = await WhatsAppService.isRecipientOptedOut(mobile);
            assert.strictEqual(isOptedOut, true, 'Must return true (fail-closed) when database is disconnected');
        } finally {
            delete mongoose.connection.readyState;
        }
    });

    it('2. Query Exception / Timeout: isRecipientOptedOut fails closed on repository errors', async () => {
        const mobile = '919811100092';
        
        // Temporarily stub Lead.findOne to throw query timeout
        const originalFindOne = Lead.findOne;
        Lead.findOne = () => {
            throw new Error('MongoTimeoutError: Server selection timed out after 5000 ms');
        };

        try {
            const isOptedOut = await WhatsAppService.isRecipientOptedOut(mobile);
            assert.strictEqual(isOptedOut, true, 'Must return true (fail-closed) when repository query throws error');
        } finally {
            Lead.findOne = originalFindOne;
        }
    });

    it('3. Unkeyed sendMessage without overrideOptOut fails closed when MongoDB is disconnected', async () => {
        const mobile = '919811100093';
        const originalReadyState = mongoose.connection.readyState;
        Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

        try {
            const res = await WhatsAppService.sendMessage(mobile, 'Unkeyed message with DB down');
            assert.strictEqual(res.success, false, 'Send must be blocked when DB is down and no override is present');
            assert.strictEqual(res.code, 'RECIPIENT_OPTED_OUT');
            assert.strictEqual(res.optedOut, true);
        } finally {
            delete mongoose.connection.readyState;
        }
    });

    it('4. Keyed sendMessage fails closed with DURABLE_LEDGER_UNAVAILABLE when MongoDB is disconnected', async () => {
        const mobile = '919811100094';
        const idempotencyKey = 'key_optout_db_down_004';
        const originalReadyState = mongoose.connection.readyState;
        Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

        try {
            const res = await WhatsAppService.sendMessage(mobile, 'Keyed message with DB down', { idempotencyKey });
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.code, 'DURABLE_LEDGER_UNAVAILABLE');
            assert.ok(res.error.includes('fail-closed'));
        } finally {
            delete mongoose.connection.readyState;
        }
    });

    it('5. Unkeyed sendMessage with overrideOptOut: true proceeds when database is down', async () => {
        const mobile = '919811100095';
        const originalReadyState = mongoose.connection.readyState;
        Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

        try {
            const res = await WhatsAppService.sendMessage(mobile, 'Emergency transactional alert', { overrideOptOut: true });
            assert.strictEqual(res.success, true, 'Explicit override allows dispatch without ledger check');
        } finally {
            delete mongoose.connection.readyState;
        }
    });

    it('6. Unkeyed sendTemplate without overrideOptOut fails closed when MongoDB is disconnected', async () => {
        const mobile = '919811100096';
        const originalReadyState = mongoose.connection.readyState;
        Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

        try {
            const res = await WhatsAppService.sendTemplate(mobile, 'sample_template', 'en');
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.code, 'RECIPIENT_OPTED_OUT');
        } finally {
            delete mongoose.connection.readyState;
        }
    });

    it('7. Unkeyed sendMedia without overrideOptOut fails closed when MongoDB is disconnected', async () => {
        const mobile = '919811100097';
        const originalReadyState = mongoose.connection.readyState;
        Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

        try {
            const res = await WhatsAppService.sendMedia(mobile, 'image', 'https://example.com/brochure.pdf');
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.code, 'RECIPIENT_OPTED_OUT');
        } finally {
            delete mongoose.connection.readyState;
        }
    });
});
