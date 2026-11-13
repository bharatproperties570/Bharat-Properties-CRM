import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import OwnerOutreachDispatchAuthorizationService from '../services/OwnerOutreachDispatchAuthorizationService.js';
import { hashEndpoint } from '../utils/ownerOutreachAudience.js';
import { normalizePhone } from '../utils/normalization.js';

const id = () => new mongoose.Types.ObjectId();
const query = (value) => ({ select: () => ({ lean: async () => value }) });

function fixture({ optOut = false, optOutAt = null, optInAt = new Date('2026-11-01T00:00:00Z'), account = null } = {}) {
    process.env.OWNER_OUTREACH_HASH_SECRET = 'owner-outreach-test-secret-which-is-long-enough';
    const campaignId = id();
    const recipientId = id();
    const contactId = id();
    const phone = '+919876543210';
    const recipient = {
        _id: recipientId,
        campaignId,
        channel: 'whatsapp',
        endpointHash: hashEndpoint('whatsapp', normalizePhone(phone)),
        contactIds: [contactId],
        dispatchState: 'PENDING'
    };
    const campaign = { _id: campaignId, status: 'APPROVED', channels: ['whatsapp'] };
    const calls = { account: 0, reserve: 0 };
    const service = new OwnerOutreachDispatchAuthorizationService({
        campaignModel: { findOne: () => query(campaign) },
        recipientModel: { findOne: () => query(recipient) },
        contactModel: {
            find: () => query([{
                _id: contactId,
                phones: [{ number: phone }],
                whatsappOptInAt: optInAt,
                whatsappOptOut: optOut,
                whatsappOptOutAt: optOutAt
            }])
        },
        integrationModel: { findOne: () => { calls.account += 1; return { lean: async () => account || {
            _id: id(), provider: 'META', connectionType: 'NEW_API', status: 'ACTIVE',
            onboardingStatus: 'CONNECTED', subscriptionStatus: 'SUBSCRIBED', webhookStatus: 'VERIFIED'
        } }; } },
        accountAuthorization: { assertCanSend: async () => ({ authorized: true }) },
        reservationService: { reserve: async () => { calls.reserve += 1; return { reserved: true, reservationId: id() }; } }
    });
    return { service, campaignId, recipientId, calls };
}

const common = (fixtureData) => ({
    user: { _id: id(), isAdmin: true },
    campaignId: fixtureData.campaignId,
    recipientId: fixtureData.recipientId,
    providerAccountId: id(),
    bucketKey: '2026-11-13',
    periodKey: '2026-11',
    globalDailyCap: 100,
    channelDailyCap: 50
});

test('dispatch authorization rechecks current Contact consent and reserves atomically without sending', async () => {
    const f = fixture();
    const result = await f.service.authorizeAndReserve(common(f));
    assert.equal(result.authorized, true);
    assert.equal(result.reserved, true);
    assert.equal(result.dispatchEnabled, false);
    assert.equal(f.calls.reserve, 1);
});

test('current opt-out blocks authorization before provider lookup or quota reservation', async () => {
    const f = fixture({ optOut: true, optOutAt: new Date('2026-11-12T00:00:00Z') });
    const result = await f.service.authorizeAndReserve(common(f));
    assert.equal(result.code, 'RECIPIENT_OPTED_OUT');
    assert.equal(f.calls.account, 0);
    assert.equal(f.calls.reserve, 0);
});

test('a later explicit opt-in supersedes an older opt-out timestamp', async () => {
    const f = fixture({
        optOut: false,
        optOutAt: new Date('2026-10-01T00:00:00Z'),
        optInAt: new Date('2026-11-01T00:00:00Z')
    });
    const result = await f.service.authorizeAndReserve(common(f));
    assert.equal(result.authorized, true);
    assert.equal(f.calls.reserve, 1);
});

test('missing current consent blocks before provider lookup and reservation', async () => {
    const f = fixture({ optInAt: null });
    const result = await f.service.authorizeAndReserve(common(f));
    assert.equal(result.code, 'CURRENT_WHATSAPP_CONSENT_NOT_FOUND');
    assert.equal(f.calls.account, 0);
    assert.equal(f.calls.reserve, 0);
});
