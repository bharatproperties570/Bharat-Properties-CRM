process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import WhatsAppGroupRegistry from '../models/WhatsAppGroupRegistry.js';
import WhatsAppGroupRegistryService from '../services/WhatsAppGroupRegistryService.js';

describe('Phase B — Enterprise Group Registry & Permission Validation Suite', () => {
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
    });

    it('1. Normal group allows sending for regular members (CAN_SEND)', () => {
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

        const res = WhatsAppGroupRegistryService.evaluatePermission(groupMeta, '919876543210', null);
        assert.equal(res.canSend, true);
        assert.equal(res.permissionStatus, 'CAN_SEND');
        assert.equal(res.status, 'ACTIVE');
        assert.equal(res.senderIsAdmin, false);
    });

    it('2. Announcement group blocks non-admin sender (ADMIN_ONLY_RESTRICTED)', () => {
        const groupMeta = {
            id: '120363002@g.us',
            subject: 'Zirakpur Announcements (Admin Only)',
            announce: true,
            restrict: true,
            participants: [
                { id: '919876543210@s.whatsapp.net', admin: null },
                { id: '919999999999@s.whatsapp.net', admin: 'superadmin' }
            ]
        };

        const res = WhatsAppGroupRegistryService.evaluatePermission(groupMeta, '919876543210', null);
        assert.equal(res.canSend, false);
        assert.equal(res.permissionStatus, 'ADMIN_ONLY_RESTRICTED');
        assert.equal(res.status, 'RESTRICTED');
        assert.equal(res.senderIsAdmin, false);
        assert.ok(res.reason.includes('Only group admins can post'));
    });

    it('3. Announcement group permits admin sender (CAN_SEND)', () => {
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

    it('4. Sender identity resolution maps correctly across PN and LID formats', () => {
        const groupMeta = {
            id: '120363004@g.us',
            subject: 'LID Verified Group',
            announce: true,
            participants: [
                { id: '12345678901234@lid', admin: 'superadmin' },
                { id: '917777777777@s.whatsapp.net', admin: null }
            ]
        };

        // Matching by LID
        const res = WhatsAppGroupRegistryService.evaluatePermission(groupMeta, '919876543210', '12345678901234');
        assert.equal(res.canSend, true);
        assert.equal(res.permissionStatus, 'CAN_SEND');
        assert.equal(res.senderIsSuperAdmin, true);
    });

    it('5. syncAllGroups idempotently upserts registry and marks removed groups as LEFT_OR_REMOVED', async () => {
        const mockSock = {
            user: { id: '919876543210:0@s.whatsapp.net', lid: '123456@lid' },
            groupFetchAllParticipating: async () => ({
                'group-1@g.us': {
                    id: 'group-1@g.us',
                    subject: 'Active Group 1',
                    announce: false,
                    participants: [{ id: '919876543210@s.whatsapp.net', admin: null }]
                },
                'group-2@g.us': {
                    id: 'group-2@g.us',
                    subject: 'Admin Channel',
                    announce: true,
                    participants: [{ id: '919876543210@s.whatsapp.net', admin: null }]
                }
            })
        };

        // Initial sync
        const res1 = await WhatsAppGroupRegistryService.syncAllGroups(testIntegrationId, mockSock);
        assert.equal(res1.count, 2);

        const active1 = await WhatsAppGroupRegistry.findOne({ integrationId: testIntegrationId, groupJid: 'group-1@g.us' });
        assert.equal(active1.permissionStatus, 'CAN_SEND');

        const active2 = await WhatsAppGroupRegistry.findOne({ integrationId: testIntegrationId, groupJid: 'group-2@g.us' });
        assert.equal(active2.permissionStatus, 'ADMIN_ONLY_RESTRICTED');

        // Subsequent sync where group-2 is removed from participating list
        mockSock.groupFetchAllParticipating = async () => ({
            'group-1@g.us': {
                id: 'group-1@g.us',
                subject: 'Active Group 1 Renamed',
                announce: false,
                participants: [{ id: '919876543210@s.whatsapp.net', admin: null }]
            }
        });

        await WhatsAppGroupRegistryService.syncAllGroups(testIntegrationId, mockSock);

        // Group 1 updated
        const updated1 = await WhatsAppGroupRegistry.findOne({ integrationId: testIntegrationId, groupJid: 'group-1@g.us' });
        assert.equal(updated1.subject, 'Active Group 1 Renamed');
        assert.equal(updated1.status, 'ACTIVE');

        // Group 2 transitioned to LEFT_OR_REMOVED
        const removed2 = await WhatsAppGroupRegistry.findOne({ integrationId: testIntegrationId, groupJid: 'group-2@g.us' });
        assert.equal(removed2.permissionStatus, 'LEFT_OR_REMOVED');
        assert.equal(removed2.status, 'INACTIVE');
    });

    it('6. validateGroupForDispatch blocks unverified or restricted groups fail-closed', async () => {
        await WhatsAppGroupRegistry.create({
            integrationId: testIntegrationId,
            groupJid: 'restricted@g.us',
            subject: 'Restricted Channel',
            announce: true,
            senderIsAdmin: false,
            permissionStatus: 'ADMIN_ONLY_RESTRICTED',
            status: 'RESTRICTED'
        });

        // 1. Restricted group
        const checkRestricted = await WhatsAppGroupRegistryService.validateGroupForDispatch(testIntegrationId, 'restricted@g.us');
        assert.equal(checkRestricted.allowed, false);
        assert.equal(checkRestricted.permissionStatus, 'ADMIN_ONLY_RESTRICTED');

        // 2. Unregistered / unknown group
        const checkUnknown = await WhatsAppGroupRegistryService.validateGroupForDispatch(testIntegrationId, 'unregistered@g.us');
        assert.equal(checkUnknown.allowed, false);
        assert.equal(checkUnknown.permissionStatus, 'UNKNOWN');

        // 3. Normal 1-on-1 contact
        const checkIndividual = await WhatsAppGroupRegistryService.validateGroupForDispatch(testIntegrationId, '919876543210@s.whatsapp.net');
        assert.equal(checkIndividual.allowed, true);
        assert.equal(checkIndividual.isGroup, false);
    });

    it('7. Tenant and Integration Isolation: Groups belonging to Integration A are never accessed by Integration B', async () => {
        await WhatsAppGroupRegistry.create({
            integrationId: testIntegrationId,
            groupJid: 'tenant-a-group@g.us',
            subject: 'Tenant A Group',
            permissionStatus: 'CAN_SEND',
            status: 'ACTIVE'
        });

        const sendableA = await WhatsAppGroupRegistryService.getSendableGroups(testIntegrationId);
        const sendableB = await WhatsAppGroupRegistryService.getSendableGroups(otherIntegrationId);

        assert.equal(sendableA.length, 1);
        assert.equal(sendableB.length, 0);

        const checkCrossTenant = await WhatsAppGroupRegistryService.validateGroupForDispatch(otherIntegrationId, 'tenant-a-group@g.us');
        assert.equal(checkCrossTenant.allowed, false);
        assert.equal(checkCrossTenant.permissionStatus, 'UNKNOWN');
    });
});
