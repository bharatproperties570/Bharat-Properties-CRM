process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import BaileysAuth from '../models/BaileysAuth.js';
import { useMongoDBAuthState, BaileysAuthDatabaseError } from '../services/baileysQueue/useMongoDBAuthState.js';

describe('Phase A — Authentication State Integrity Suite', () => {
    let mongoServer;

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
        await BaileysAuth.deleteMany({});
    });

    it('1. Credential persistence & BufferJSON roundtrip integrity', async () => {
        const sessionId = 'test-session-1';
        const { state, saveCreds } = await useMongoDBAuthState(sessionId);

        assert.ok(state.creds, 'Initial creds must be generated when none exist in clean DB');
        assert.ok(state.creds.noiseKey, 'Noise key must exist in creds');

        // Mutate a property and save
        state.creds.me = { id: '919876543210:1@s.whatsapp.net', name: 'Test User' };
        await saveCreds();

        // Read directly from DB to verify document was written
        const doc = await BaileysAuth.findOne({ sessionId, fileId: 'creds' });
        assert.ok(doc, 'Creds document must exist in DB');
        assert.ok(doc.data.includes('919876543210'), 'Creds payload must contain saved phone');

        // Re-open auth state and verify credentials match persisted state
        const restored = await useMongoDBAuthState(sessionId);
        assert.equal(restored.state.creds.me?.name, 'Test User');
        assert.equal(restored.state.creds.me?.id, '919876543210:1@s.whatsapp.net');
    });

    it('2. Distinguishes genuinely absent key (null) from successful query', async () => {
        const sessionId = 'test-session-2';
        const { state } = await useMongoDBAuthState(sessionId);

        // Save one key
        await state.keys.set({
            'pre-key': {
                '1': { keyPair: { public: Buffer.from('test-pub'), private: Buffer.from('test-priv') } }
            }
        });

        // Query both an existing key and an absent key
        const results = await state.keys.get('pre-key', ['1', '999']);
        assert.ok(results['1'], 'Key 1 must be present');
        assert.equal(results['999'], null, 'Key 999 is genuinely absent and must be null');
    });

    it('3. Database read failure in keys.get throws BaileysAuthDatabaseError instead of disguising as missing keys', async () => {
        const sessionId = 'test-session-3';
        const { state } = await useMongoDBAuthState(sessionId);

        // Temporarily stub BaileysAuth.find to simulate database / network failure
        const origFind = BaileysAuth.find;
        BaileysAuth.find = () => {
            throw new Error('MongoNetworkTimeoutException: connection timed out');
        };

        try {
            await assert.rejects(
                async () => {
                    await state.keys.get('pre-key', ['1', '2']);
                },
                (err) => {
                    assert.ok(err instanceof BaileysAuthDatabaseError, 'Must throw BaileysAuthDatabaseError');
                    assert.ok(err.message.includes('Database query failed during keys.get'));
                    assert.equal(err.sessionId, sessionId);
                    assert.equal(err.type, 'pre-key');
                    return true;
                }
            );
        } finally {
            BaileysAuth.find = origFind;
        }
    });

    it('4. Database read failure in useMongoDBAuthState throws and NEVER calls initAuthCreds() to overwrite session', async () => {
        const sessionId = 'test-session-4';

        // Pre-populate legitimate creds in DB
        await BaileysAuth.create({
            sessionId,
            fileId: 'creds',
            data: JSON.stringify({ me: { id: '919999999999@s.whatsapp.net', name: 'Original User' } })
        });

        // Simulate DB crash during findOne
        const origFindOne = BaileysAuth.findOne;
        BaileysAuth.findOne = () => {
            throw new Error('MongoServerSelectionError: cluster unavailable');
        };

        try {
            await assert.rejects(
                async () => {
                    await useMongoDBAuthState(sessionId);
                },
                (err) => {
                    assert.ok(err instanceof BaileysAuthDatabaseError, 'Must throw BaileysAuthDatabaseError on DB failure');
                    return true;
                }
            );
        } finally {
            BaileysAuth.findOne = origFindOne;
        }

        // Verify the original database record was NOT overwritten by fresh random creds
        const intactDoc = await BaileysAuth.findOne({ sessionId, fileId: 'creds' });
        assert.ok(intactDoc.data.includes('Original User'), 'Original creds must remain intact in DB');
    });

    it('5. Database write failure in saveCreds throws BaileysAuthDatabaseError', async () => {
        const sessionId = 'test-session-5';
        const { saveCreds } = await useMongoDBAuthState(sessionId);

        const origUpdateOne = BaileysAuth.updateOne;
        BaileysAuth.updateOne = () => {
            throw new Error('MongoWriteException: disk full or primary stepped down');
        };

        try {
            await assert.rejects(
                async () => {
                    await saveCreds();
                },
                (err) => {
                    assert.ok(err instanceof BaileysAuthDatabaseError);
                    assert.equal(err.fileId, 'creds');
                    return true;
                }
            );
        } finally {
            BaileysAuth.updateOne = origUpdateOne;
        }
    });

    it('6. Partial or complete bulkWrite failure in keys.set throws BaileysAuthDatabaseError', async () => {
        const sessionId = 'test-session-6';
        const { state } = await useMongoDBAuthState(sessionId);

        const origBulkWrite = BaileysAuth.bulkWrite;
        BaileysAuth.bulkWrite = () => {
            throw new Error('MongoBulkWriteError: write concern error');
        };

        try {
            await assert.rejects(
                async () => {
                    await state.keys.set({
                        'session': {
                            'session-1': Buffer.from('session-data')
                        }
                    });
                },
                (err) => {
                    assert.ok(err instanceof BaileysAuthDatabaseError);
                    assert.ok(err.message.includes('bulkWrite'));
                    return true;
                }
            );
        } finally {
            BaileysAuth.bulkWrite = origBulkWrite;
        }
    });

    it('7. Session Isolation: Keys and credentials never bleed across different sessions', async () => {
        const sessionA = 'session-tenant-alpha';
        const sessionB = 'session-tenant-beta';

        const authA = await useMongoDBAuthState(sessionA);
        const authB = await useMongoDBAuthState(sessionB);

        await authA.state.keys.set({
            'sender-key': {
                'group1': { cipherKey: 'secret-a' }
            }
        });

        await authB.state.keys.set({
            'sender-key': {
                'group1': { cipherKey: 'secret-b' }
            }
        });

        const readA = await authA.state.keys.get('sender-key', ['group1']);
        const readB = await authB.state.keys.get('sender-key', ['group1']);

        assert.equal(readA['group1'].cipherKey, 'secret-a');
        assert.equal(readB['group1'].cipherKey, 'secret-b');
    });

    it('8. Recovery after transient database failure: Caller can safely retry operations after DB reconnects', async () => {
        const sessionId = 'test-session-8';
        const auth = await useMongoDBAuthState(sessionId);

        let failNextCall = true;
        const origFind = BaileysAuth.find;
        BaileysAuth.find = function(...args) {
            if (failNextCall) {
                failNextCall = false;
                throw new Error('Transient MongoSocketClosedError');
            }
            return origFind.apply(this, args);
        };

        try {
            // First call fails
            await assert.rejects(async () => {
                await auth.state.keys.get('session', ['test']);
            }, BaileysAuthDatabaseError);

            // Second call succeeds because DB is back
            const recovered = await auth.state.keys.get('session', ['test']);
            assert.equal(recovered['test'], null);
        } finally {
            BaileysAuth.find = origFind;
        }
    });
});
