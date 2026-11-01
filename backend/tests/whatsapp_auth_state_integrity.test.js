process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import BaileysAuth from '../models/BaileysAuth.js';
import {
    useMongoDBAuthState,
    BaileysAuthDatabaseError,
    BaileysAuthKeyCorruptionError
} from '../services/baileysQueue/useMongoDBAuthState.js';

describe('Phase A & 5 — Authentication State & Key Corruption Integrity Suite', () => {
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

        state.creds.me = { id: '919876543210:1@s.whatsapp.net', name: 'Test User' };
        await saveCreds();

        const doc = await BaileysAuth.findOne({ sessionId, fileId: 'creds' });
        assert.ok(doc, 'Creds document must exist in DB');
        assert.ok(doc.data.includes('919876543210'), 'Creds payload must contain saved phone');

        const restored = await useMongoDBAuthState(sessionId);
        assert.equal(restored.state.creds.me?.name, 'Test User');
        assert.equal(restored.state.creds.me?.id, '919876543210:1@s.whatsapp.net');
    });

    it('2. Distinguishes genuinely absent key (null) from successful query', async () => {
        const sessionId = 'test-session-2';
        const { state } = await useMongoDBAuthState(sessionId);

        await state.keys.set({
            'pre-key': {
                '1': { keyPair: { public: Buffer.from('test-pub'), private: Buffer.from('test-priv') } }
            }
        });

        const results = await state.keys.get('pre-key', ['1', '999']);
        assert.ok(results['1'], 'Key 1 must be present');
        assert.equal(results['999'], null, 'Key 999 is genuinely absent and must be null');
    });

    it('3. Corrupted stored Signal key throws BaileysAuthKeyCorruptionError and NEVER silently converts to null', async () => {
        const sessionId = 'test-session-corrupt-key';
        const { state } = await useMongoDBAuthState(sessionId);

        // Pre-insert a corrupt (unparseable JSON) key record into MongoDB
        await BaileysAuth.create({
            sessionId,
            fileId: 'pre-key-42',
            data: '{ invalid-json-payload-corrupted-bytes: [;;'
        });

        await assert.rejects(
            async () => {
                await state.keys.get('pre-key', ['42']);
            },
            (err) => {
                assert.ok(err instanceof BaileysAuthKeyCorruptionError, 'Must throw BaileysAuthKeyCorruptionError on corrupted key');
                assert.ok(err.message.includes('is corrupted and cannot be deserialized'));
                assert.equal(err.sessionId, sessionId);
                assert.equal(err.fileId, 'pre-key-42');
                return true;
            }
        );
    });

    it('4. Corrupted creds document throws BaileysAuthKeyCorruptionError and NEVER calls initAuthCreds() to overwrite session', async () => {
        const sessionId = 'test-session-corrupt-creds';

        // Pre-insert a corrupted creds document
        await BaileysAuth.create({
            sessionId,
            fileId: 'creds',
            data: '<<<CORRUPTED_CREDS_DATA_CANNOT_PARSE>>>'
        });

        await assert.rejects(
            async () => {
                await useMongoDBAuthState(sessionId);
            },
            (err) => {
                assert.ok(err instanceof BaileysAuthKeyCorruptionError, 'Must throw BaileysAuthKeyCorruptionError');
                assert.equal(err.fileId, 'creds');
                return true;
            }
        );

        // Verify the corrupted record was NOT overwritten by fresh random creds
        const record = await BaileysAuth.findOne({ sessionId, fileId: 'creds' });
        assert.equal(record.data, '<<<CORRUPTED_CREDS_DATA_CANNOT_PARSE>>>');
    });

    it('5. Database read failure in keys.get throws BaileysAuthDatabaseError instead of disguising as missing keys', async () => {
        const sessionId = 'test-session-3';
        const { state } = await useMongoDBAuthState(sessionId);

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

    it('6. Database read failure in useMongoDBAuthState throws and NEVER calls initAuthCreds() to overwrite session', async () => {
        const sessionId = 'test-session-4';

        await BaileysAuth.create({
            sessionId,
            fileId: 'creds',
            data: JSON.stringify({ me: { id: '919999999999@s.whatsapp.net', name: 'Original User' } })
        });

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

        const intactDoc = await BaileysAuth.findOne({ sessionId, fileId: 'creds' });
        assert.ok(intactDoc.data.includes('Original User'), 'Original creds must remain intact in DB');
    });

    it('7. Database write failure in saveCreds throws BaileysAuthDatabaseError', async () => {
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

    it('8. Partial or complete bulkWrite failure in keys.set throws BaileysAuthDatabaseError', async () => {
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

    it('9. Session Isolation: Keys and credentials never bleed across different sessions', async () => {
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
});
