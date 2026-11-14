import test from 'node:test';
import OwnerOutreachService from '../services/OwnerOutreachService.js';
import Inventory from '../models/Inventory.js';
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

test('WhatsApp audience snapshot respects timestamped opt-out and later opt-in', () => {
    const optedInAt = new Date('2026-11-01T10:00:00.000Z');
    const optedOutAt = new Date('2026-11-02T10:00:00.000Z');
    const suppressed = buildOwnerOutreachAudience([{
        _id: 'inv-optout',
        owners: [{ _id: 'contact-optout', phones: [{ number: '9876543212' }], whatsappOptInAt: optedInAt, whatsappOptOut: false, whatsappOptOutAt: optedOutAt }]
    }]);
    assert.equal(suppressed.endpoints.find((x) => x.channel === 'whatsapp').eligibility, 'SUPPRESSED_OPTOUT');

    const optedInAgain = buildOwnerOutreachAudience([{
        _id: 'inv-optin-again',
        owners: [{ _id: 'contact-optin-again', phones: [{ number: '9876543213' }], whatsappOptInAt: new Date('2026-11-03T10:00:00.000Z'), whatsappOptOut: false, whatsappOptOutAt: optedOutAt }]
    }]);
    assert.equal(optedInAgain.endpoints.find((x) => x.channel === 'whatsapp').eligibility, 'ELIGIBLE');
});


test('shared WhatsApp endpoint upgrades unknown consent when another linked contact opted in', () => {
    const items = [
        { _id: 'inv-unknown', owners: [{ _id: 'contact-unknown', phones: [{ number: '9876543220' }] }] },
        { _id: 'inv-consented', owners: [{ _id: 'contact-consented', phones: [{ number: '9876543220' }], whatsappOptInAt: new Date('2026-11-10T10:00:00.000Z') }] }
    ];
    const endpoint = buildOwnerOutreachAudience(items).endpoints.find((x) => x.channel === 'whatsapp');
    assert.equal(endpoint.consentState, 'CONSENTED');
    assert.equal(endpoint.eligibility, 'ELIGIBLE');
    assert.equal(endpoint.contactIds.length, 2);
});

test('shared WhatsApp endpoint remains opted out if any linked contact has an active opt-out', () => {
    const items = [
        { _id: 'inv-consented', owners: [{ _id: 'contact-consented', phones: [{ number: '9876543221' }], whatsappOptInAt: new Date('2026-11-10T10:00:00.000Z') }] },
        { _id: 'inv-opted-out', owners: [{ _id: 'contact-opted-out', phones: [{ number: '9876543221' }], whatsappOptOut: true }] }
    ];
    const endpoint = buildOwnerOutreachAudience(items).endpoints.find((x) => x.channel === 'whatsapp');
    assert.equal(endpoint.consentState, 'OPTED_OUT');
    assert.equal(endpoint.eligibility, 'SUPPRESSED_OPTOUT');
});

test('inventory picker enforces minimum query length without touching the database', async () => {
    const result = await new OwnerOutreachService().searchInventory({ q: 'x' }, null);
    assert.deepEqual(result, { items: [], minimumQueryLength: 2 });
});

test('inventory picker escapes search input, caps result size and returns no owner PII', async () => {
    const originalFind = Inventory.find;
    let capturedQuery;
    let capturedProjection;
    let capturedLimit;
    Inventory.find = (query) => {
        capturedQuery = query;
        const chain = {
            select(value) { capturedProjection = value; return this; },
            sort() { return this; },
            limit(value) { capturedLimit = value; return this; },
            async lean() {
                return [{ _id: 'inventory-1', projectName: 'Sector [3]', unitNo: 'A-12', sizeLabel: '6 Marla', owners: [{ name: 'Must not be returned' }] }];
            }
        };
        return chain;
    };
    try {
        const result = await new OwnerOutreachService().searchInventory({ q: 'Sector [3]', limit: 500 }, null);
        assert.equal(capturedLimit, 50);
        assert.equal(capturedProjection, '_id projectName unitNo unitNumber sector sizeLabel');
        assert.equal(capturedQuery.$and[0]._id, null);
        const searchCondition = capturedQuery.$and[2].$or.find((condition) => condition.projectName);
        assert.equal(searchCondition.projectName.test('Sector [3]'), true);
        assert.equal(searchCondition.projectName.test('Sector 3'), false);
        assert.deepEqual(result.items, [{
            id: 'inventory-1',
            project: 'Sector [3]',
            unit: 'A-12',
            size: '6 Marla',
            label: 'Sector [3] · A-12'
        }]);
        assert.equal(JSON.stringify(result).includes('Must not be returned'), false);
    } finally {
        Inventory.find = originalFind;
    }
});
