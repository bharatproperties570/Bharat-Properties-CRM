process.env.NODE_ENV = 'test';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import BaileysConnectionManager from '../services/baileysQueue/BaileysConnectionManager.js';

describe('Baileys Group Metadata Cache & Bounded Memory Verification Suite', () => {
    const testIntegrationId = 'test_integration_meta_cache_001';

    beforeEach(async () => {
        await BaileysConnectionManager.logout(testIntegrationId);
        BaileysConnectionManager._setSocketForTesting(testIntegrationId, null);
    });

    afterEach(async () => {
        await BaileysConnectionManager.logout(testIntegrationId);
        BaileysConnectionManager._setSocketForTesting(testIntegrationId, null);
    });

    it('1. Cache Hit within 30-min TTL: Returns cached metadata without querying live socket', async () => {
        const groupJid = '123456789-987654@g.us';
        const initialMetadata = {
            id: groupJid,
            subject: 'Luxury Penthouse Buyers Group',
            participants: [{ id: '919811100001@s.whatsapp.net', admin: 'superadmin' }]
        };

        // Populate cache
        BaileysConnectionManager.setCachedGroupMetadata(testIntegrationId, groupJid, initialMetadata);

        let liveFetchCalled = false;
        const mockSock = {
            ws: { isOpen: true },
            groupMetadata: async (jid) => {
                liveFetchCalled = true;
                return { id: jid, subject: 'Live Socket Data', participants: [] };
            }
        };
        BaileysConnectionManager._setSocketForTesting(testIntegrationId, mockSock);

        // Fetch metadata
        const result = await BaileysConnectionManager.getCachedGroupMetadata(testIntegrationId, groupJid);

        assert.strictEqual(liveFetchCalled, false, 'Live socket must NOT be queried on a cache hit');
        assert.deepStrictEqual(result, initialMetadata);
    });

    it('2. Cache Miss: Queries live socket and caches the result for future calls', async () => {
        const groupJid = '234567890-876543@g.us';
        let socketQueryCount = 0;
        const freshMetadata = {
            id: groupJid,
            subject: 'Gurgaon Commercial Investors',
            participants: [{ id: '919811100002@s.whatsapp.net', admin: null }]
        };

        const mockSock = {
            ws: { isOpen: true },
            groupMetadata: async (jid) => {
                socketQueryCount++;
                return freshMetadata;
            }
        };
        BaileysConnectionManager._setSocketForTesting(testIntegrationId, mockSock);

        // Call 1: Cache Miss -> Fetches from socket
        const res1 = await BaileysConnectionManager.getCachedGroupMetadata(testIntegrationId, groupJid);
        assert.strictEqual(socketQueryCount, 1, 'Socket must be queried once on cache miss');
        assert.deepStrictEqual(res1, freshMetadata);

        // Call 2: Cache Hit -> Returns cached data without socket call
        const res2 = await BaileysConnectionManager.getCachedGroupMetadata(testIntegrationId, groupJid);
        assert.strictEqual(socketQueryCount, 1, 'Socket must NOT be queried on second call (cache hit)');
        assert.deepStrictEqual(res2, freshMetadata);
    });

    it('3. TTL Expiry: Entries older than 30 minutes trigger fresh socket query', async () => {
        const groupJid = '345678901-765432@g.us';
        let socketQueryCount = 0;

        const initialMetadata = { id: groupJid, subject: 'Stale Subject', participants: [] };
        const updatedMetadata = { id: groupJid, subject: 'Fresh Subject (Post-TTL)', participants: [] };

        // Seed with timestamp 31 minutes ago (>30 min TTL)
        BaileysConnectionManager.setCachedGroupMetadata(testIntegrationId, groupJid, initialMetadata);

        // Mock socket
        const mockSock = {
            ws: { isOpen: true },
            groupMetadata: async (jid) => {
                socketQueryCount++;
                return updatedMetadata;
            }
        };
        BaileysConnectionManager._setSocketForTesting(testIntegrationId, mockSock);

        // Artificially age the cache entry by 31 minutes
        const originalNow = Date.now;
        try {
            // Fast-forward time by 31 minutes (31 * 60 * 1000 ms)
            Date.now = () => originalNow() + (31 * 60 * 1000);

            const result = await BaileysConnectionManager.getCachedGroupMetadata(testIntegrationId, groupJid);
            assert.strictEqual(socketQueryCount, 1, 'Socket must be re-queried once TTL has expired');
            assert.strictEqual(result.subject, 'Fresh Subject (Post-TTL)');
        } finally {
            Date.now = originalNow;
        }
    });

    it('4. Explicit Cache Invalidation: invalidateCachedGroupMetadata forces fresh fetch on next call', async () => {
        const groupJid = '456789012-654321@g.us';
        let socketQueryCount = 0;

        const cachedData = { id: groupJid, subject: 'Pre-Invalidation Subject', participants: [] };
        const refetchedData = { id: groupJid, subject: 'Post-Invalidation Subject', participants: [] };

        BaileysConnectionManager.setCachedGroupMetadata(testIntegrationId, groupJid, cachedData);

        const mockSock = {
            ws: { isOpen: true },
            groupMetadata: async (jid) => {
                socketQueryCount++;
                return refetchedData;
            }
        };
        BaileysConnectionManager._setSocketForTesting(testIntegrationId, mockSock);

        // Invalidate entry
        BaileysConnectionManager.invalidateCachedGroupMetadata(testIntegrationId, groupJid);

        // Next call must query socket
        const result = await BaileysConnectionManager.getCachedGroupMetadata(testIntegrationId, groupJid);
        assert.strictEqual(socketQueryCount, 1, 'Socket must be queried following explicit cache invalidation');
        assert.strictEqual(result.subject, 'Post-Invalidation Subject');
    });

    it('5. Bounded Memory Eviction: Cache caps at 2,000 entries and applies FIFO eviction without memory leak', async () => {
        // Seed exactly 2,000 entries
        for (let i = 1; i <= 2000; i++) {
            BaileysConnectionManager.setCachedGroupMetadata(testIntegrationId, `group_${i}@g.us`, {
                id: `group_${i}@g.us`,
                subject: `Group ${i}`,
                participants: []
            });
        }

        // Verify group 1 is present
        const g1 = await BaileysConnectionManager.getCachedGroupMetadata(testIntegrationId, 'group_1@g.us');
        assert.ok(g1, 'group_1 must be present in cache');
        assert.strictEqual(g1.subject, 'Group 1');

        // Add 2,001st entry (must trigger FIFO eviction of group_1)
        BaileysConnectionManager.setCachedGroupMetadata(testIntegrationId, 'group_2001@g.us', {
            id: 'group_2001@g.us',
            subject: 'Group 2001 (Trigger Eviction)',
            participants: []
        });

        // group_1 must now be evicted (null without live socket)
        const g1Evicted = await BaileysConnectionManager.getCachedGroupMetadata(testIntegrationId, 'group_1@g.us');
        assert.strictEqual(g1Evicted, null, 'group_1 must have been evicted by FIFO policy when cache exceeded 2,000 entries');

        // group_2001 and group_2 must be present
        const g2001 = await BaileysConnectionManager.getCachedGroupMetadata(testIntegrationId, 'group_2001@g.us');
        assert.ok(g2001, 'group_2001 must be present in cache');
        assert.strictEqual(g2001.subject, 'Group 2001 (Trigger Eviction)');

        const g2 = await BaileysConnectionManager.getCachedGroupMetadata(testIntegrationId, 'group_2@g.us');
        assert.ok(g2, 'group_2 must be retained');
    });
});
