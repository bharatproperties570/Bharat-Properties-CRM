process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import WhatsAppGroupRegistry from '../models/WhatsAppGroupRegistry.js';
import WhatsAppGroupRegistryService, { GROUP_METADATA_MAX_AGE_MS } from '../services/WhatsAppGroupRegistryService.js';
import WhatsAppService from '../services/WhatsAppService.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';

describe('Phase B & 4 — Enterprise Group Registry & Permission Freshness Suite', () => {
    let mongoServer;
    const testIntegrationId = new mongoose.Types.ObjectId();
    const otherIntegrationId = new mongoose.Types.ObjectId();

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(uri);
    });

    after(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    beforeEach(async () => {
        await WhatsAppGroupRegistry.deleteMany({});
        await WhatsAppIntegration.deleteMany({});
    });

    it('1. Exact PN matching works for standard Indian 10-digit and international formats', () => {
        const groupMeta = {
            id: '120363001@g.us',
            subject: 'Mohali Property Circle',
            announce: false,
            restrict: false,
            participants: [
                { id: '919876543210@s.whatsapp.net', admin: null },
                { id: '919111111111@s.whatsapp.net', admin: 'admin' }
            ]
        };

        const res = WhatsAppGroupRegistryService.evaluatePermission(groupMeta, '9876543210', null);
        assert.equal(res.canSend, true);
        assert.equal(res.permissionStatus, 'CAN_SEND');
        assert.equal(res.status, 'ACTIVE');
        assert.equal(res.senderIsAdmin, false);
    });

    it('2. Partial-digit collisions DO NOT match and do not grant unauthorized admin rights', () => {
        // Participant has number 9999876543210 (ends with 9876543210 but is NOT the sender)
        const groupMeta = {
            id: '120363002@g.us',
            subject: 'Announcement Channel',
            announce: true,
            restrict: true,
            participants: [
                { id: '9999876543210@s.whatsapp.net', admin: 'admin' }, // Colliding suffix
                { id: '919876543210@s.whatsapp.net', admin: null }       // Actual sender (regular member)
            ]
        };

        const res = WhatsAppGroupRegistryService.evaluatePermission(groupMeta, '9876543210', null);
        // Actual sender is NOT admin, so announce: true must result in ADMIN_ONLY_RESTRICTED
        assert.equal(res.canSend, false);
        assert.equal(res.permissionStatus, 'ADMIN_ONLY_RESTRICTED');
        assert.equal(res.senderIsAdmin, false);
    });

    it('3. Announcement group permits verified admin sender (CAN_SEND)', () => {
        const groupMeta = {
            id: '120363003@g.us',
            subject: 'Official Deals Broadcast Channel',
            announce: true,
            restrict: true,
            participants: [
                { id: '919876543210@s.whatsapp.net', admin: 'admin' },
                { id: '918888888888@s.whatsapp.net', admin: null }
            ]
        };

        const res = WhatsAppGroupRegistryService.evaluatePermission(groupMeta, '919876543210', null);
        assert.equal(res.canSend, true);
        assert.equal(res.permissionStatus, 'CAN_SEND');
        assert.equal(res.status, 'ACTIVE');
        assert.equal(res.senderIsAdmin, true);
    });

    it('4. Sender identity resolution maps correctly across exact LID format', () => {
        const groupMeta = {
            id: '120363004@g.us',
            subject: 'LID Verified Group',
            announce: true,
            participants: [
                { id: '12345678901234@lid', admin: 'superadmin' },
                { id: '917777777777@s.whatsapp.net', admin: null }
            ]
        };

        const res = WhatsAppGroupRegistryService.evaluatePermission(groupMeta, '919876543210', '12345678901234');
        assert.equal(res.canSend, true);
        assert.equal(res.permissionStatus, 'CAN_SEND');
        assert.equal(res.senderIsSuperAdmin, true);
    });

    it('5. Stale metadata (>24h) blocks group dispatch fail-closed in validateGroupForDispatch and getSendableGroups', async () => {
        const staleDate = new Date(Date.now() - (GROUP_METADATA_MAX_AGE_MS + 3600000)); // 25 hours ago

        await WhatsAppGroupRegistry.create({
            integrationId: testIntegrationId,
            groupJid: 'stale-group@g.us',
            subject: 'Stale Group',
            announce: false,
            permissionStatus: 'CAN_SEND',
            status: 'ACTIVE',
            metadataFetchedAt: staleDate,
            lastVerifiedAt: staleDate
        });

        // 1. validateGroupForDispatch blocks stale group
        const valRes = await WhatsAppGroupRegistryService.validateGroupForDispatch(testIntegrationId, 'stale-group@g.us');
        assert.equal(valRes.allowed, false);
        assert.equal(valRes.permissionStatus, 'STALE_METADATA');
        assert.ok(valRes.reason.includes('stale'));

        // 2. getSendableGroups excludes stale group
        const sendable = await WhatsAppGroupRegistryService.getSendableGroups(testIntegrationId);
        assert.equal(sendable.length, 0, 'Stale groups must be excluded from sendable groups list');
    });

    it('6. Empty socket response skips purge and protects existing registered groups', async () => {
        // Pre-create an existing verified group
        await WhatsAppGroupRegistry.create({
            integrationId: testIntegrationId,
            groupJid: 'existing-group@g.us',
            subject: 'Existing Active Group',
            announce: false,
            permissionStatus: 'CAN_SEND',
            status: 'ACTIVE',
            metadataFetchedAt: new Date()
        });

        const mockSockEmpty = {
            user: { id: '919876543210:0@s.whatsapp.net' },
            groupFetchAllParticipating: async () => ({})
        };

        const res = await WhatsAppGroupRegistryService.syncAllGroups(testIntegrationId, mockSockEmpty);
        assert.equal(res.skippedPurge, true);

        // Verify existing group is still ACTIVE and NOT deactivated
        const group = await WhatsAppGroupRegistry.findOne({ integrationId: testIntegrationId, groupJid: 'existing-group@g.us' });
        assert.equal(group.status, 'ACTIVE');
        assert.equal(group.permissionStatus, 'CAN_SEND');
    });

    it('7. Actual WhatsAppService permission gate blocks socket send fail-closed when group permission fails', async () => {
        await WhatsAppIntegration.create({
            _id: testIntegrationId,
            provider: 'BAILEYS',
            status: 'ACTIVE',
            accountLabel: 'Test Line'
        });

        // 1. Target an unverified/missing group
        const res = await WhatsAppService.sendMessage('unregistered-group@g.us', 'Hello group', {
            integrationId: testIntegrationId.toString(),
            useBaileys: true,
            provider: 'BAILEYS'
        });

        assert.equal(res.success, false);
        assert.equal(res.deliveryStatus, 'FAILED');
        assert.ok(res.error.includes('GROUP_PERMISSION_DENIED'));
        assert.ok(res.error.includes('not registered'));
    });

    it('8. Actual WhatsAppService fails closed with GROUP_PERMISSION_VALIDATION_UNAVAILABLE when registry throws DB error', async () => {
        await WhatsAppIntegration.create({
            _id: testIntegrationId,
            provider: 'BAILEYS',
            status: 'ACTIVE',
            accountLabel: 'Test Line'
        });

        const origFindOne = WhatsAppGroupRegistry.findOne;
        WhatsAppGroupRegistry.findOne = () => {
            throw new Error('MongoClusterUnavailable: primary stepped down');
        };

        try {
            const res = await WhatsAppService.sendMessage('120363001@g.us', 'Hello group', {
                integrationId: testIntegrationId.toString(),
                useBaileys: true,
                provider: 'BAILEYS'
            });

            assert.equal(res.success, false);
            assert.equal(res.deliveryStatus, 'FAILED');
            assert.ok(res.error.includes('GROUP_PERMISSION_VALIDATION_UNAVAILABLE'));
        } finally {
            WhatsAppGroupRegistry.findOne = origFindOne;
        }
    });
});
