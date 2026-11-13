import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerOutreachAudience, hashEndpoint, isLikelyBrokerContact, normalizeEmail, OWNER_OUTREACH_BATCH_SIZES } from '../utils/ownerOutreachAudience.js';

process.env.OWNER_OUTREACH_HASH_SECRET = 'owner-outreach-unit-test-secret-32-characters';

test('owner outreach validates supported batch sizes and normalizes email', () => {
    assert.deepEqual(OWNER_OUTREACH_BATCH_SIZES, [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1250, 1500, 1750, 2000]);
    assert.equal(normalizeEmail('  TEST@Example.COM '), 'test@example.com');
    assert.equal(normalizeEmail('not-an-email'), '');
});

test('broker exclusion uses explicit professional markers only', () => {
    assert.equal(isLikelyBrokerContact({ professionCategory: 'Real Estate Broker' }), true);
    assert.equal(isLikelyBrokerContact({ designation: 'Property Dealer' }), true);
    assert.equal(isLikelyBrokerContact({ designation: 'Owner' }), false);
    assert.equal(isLikelyBrokerContact({ professionCategory: 'Business' }), false);
});

test('audience deduplicates shared endpoints and preserves inventory provenance', () => {
    const items = [
        { _id: 'inv1', owners: [{ _id: 'c1', phones: [{ number: '+91 98765 43210' }], emails: [{ address: 'A@EXAMPLE.COM' }], whatsappOptInAt: new Date() }], associates: [] },
        { _id: 'inv2', owners: [{ _id: 'c2', phones: [{ number: '+91 98765 43210' }], emails: [{ address: 'a@example.com' }] }], associates: [] }
    ];
    const result = buildOwnerOutreachAudience(items);
    assert.equal(result.uniquePeople, 2);
    assert.equal(result.endpoints.filter((x) => x.channel === 'whatsapp').length, 1);
    assert.equal(result.endpoints.filter((x) => x.channel === 'email').length, 1);
    assert.equal(result.endpoints.find((x) => x.channel === 'whatsapp').inventoryIds.length, 2);
    assert.equal(result.endpoints.find((x) => x.channel === 'whatsapp').eligibility, 'ELIGIBLE');
    assert.equal(hashEndpoint('whatsapp', '919876543210'), hashEndpoint('whatsapp', '919876543210'));
});

test('associate audience is opt-in to inclusion and WhatsApp opt-outs suppress endpoint', () => {
    const items = [{ _id: 'inv1', owners: [{ _id: 'c1', phones: [{ number: '9876543210' }], whatsappOptOut: true }], associates: [{ relationship: 'Investor', contact: { _id: 'c2', phones: [{ number: '9876543211' }] } }] }];
    const ownerOnly = buildOwnerOutreachAudience(items);
    assert.equal(ownerOnly.uniquePeople, 1);
    assert.equal(ownerOnly.endpoints[0].eligibility, 'SUPPRESSED_OPTOUT');
    const withAssociate = buildOwnerOutreachAudience(items, { includeAssociates: true });
    assert.equal(withAssociate.uniquePeople, 2);
});
