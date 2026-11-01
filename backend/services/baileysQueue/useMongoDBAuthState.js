import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import BaileysAuth from '../../models/BaileysAuth.js';

export class BaileysAuthDatabaseError extends Error {
    constructor(message, originalError, sessionDetails = {}) {
        super(message);
        this.name = 'BaileysAuthDatabaseError';
        this.originalError = originalError;
        this.sessionId = sessionDetails?.sessionId;
        this.fileId = sessionDetails?.fileId;
        this.type = sessionDetails?.type;
    }
}

export class BaileysAuthKeyCorruptionError extends Error {
    constructor(message, originalError, sessionDetails = {}) {
        super(message);
        this.name = 'BaileysAuthKeyCorruptionError';
        this.originalError = originalError;
        this.sessionId = sessionDetails?.sessionId;
        this.fileId = sessionDetails?.fileId;
        this.type = sessionDetails?.type;
    }
}

export const useMongoDBAuthState = async (sessionId, options = {}) => {
    // Explicitly resolve integration identifier used for Circuit Breaker attribution
    const integrationId = options?.integrationId || sessionId;

    const writeData = async (data, fileId) => {
        try {
            await BaileysAuth.updateOne(
                { sessionId, fileId },
                { $set: { data: JSON.stringify(data, BufferJSON.replacer) } },
                { upsert: true }
            );
        } catch (error) {
            console.error(`[BaileysAuth] Error writing to MongoDB for session ${sessionId} and file ${fileId}:`, error.message);
            // Wire auth persistence failure to durable circuit breaker using resolved integrationId
            if (integrationId) {
                import('../WhatsAppCircuitBreaker.js').then(({ default: WhatsAppCircuitBreaker }) => {
                    WhatsAppCircuitBreaker.recordAuthFailure(integrationId, error).catch(() => {});
                }).catch(() => {});
            }

            throw new BaileysAuthDatabaseError(`Failed to write Baileys auth record for fileId '${fileId}'`, error, { sessionId, fileId });
        }
    };

    const readData = async (fileId) => {
        let document;
        try {
            document = await BaileysAuth.findOne({ sessionId, fileId });
        } catch (error) {
            console.error(`[BaileysAuth] Error reading from MongoDB for session ${sessionId} and file ${fileId}:`, error.message);
            throw new BaileysAuthDatabaseError(`Failed to read Baileys auth record for fileId '${fileId}'`, error, { sessionId, fileId });
        }

        if (!document) {
            return null; // Genuinely absent key
        }

        if (document.data) {
            try {
                return JSON.parse(document.data, BufferJSON.reviver);
            } catch (parseErr) {
                console.error(`[BaileysAuth] CRITICAL: Corrupted authentication payload for session ${sessionId}, fileId ${fileId}:`, parseErr.message);
                throw new BaileysAuthKeyCorruptionError(`Persisted authentication record for '${fileId}' in session '${sessionId}' is corrupted and cannot be parsed`, parseErr, { sessionId, fileId });
            }
        }

        return null;
    };

    const removeData = async (fileId) => {
        try {
            await BaileysAuth.deleteOne({ sessionId, fileId });
        } catch (error) {
            console.error(`[BaileysAuth] Error removing from MongoDB for session ${sessionId} and file ${fileId}:`, error.message);
            throw new BaileysAuthDatabaseError(`Failed to remove Baileys auth record for fileId '${fileId}'`, error, { sessionId, fileId });
        }
    };

    // Reads credentials. If readData throws due to a DB outage or key corruption, the error propagates
    // and initAuthCreds() is NEVER called, protecting existing session state from destruction.
    const credsData = await readData('creds');
    let creds = credsData || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    if (!ids || ids.length === 0) return data;

                    try {
                        const fileIdMap = new Map();
                        const fileIds = ids.map(id => {
                            const fileId = `${type}-${id}`;
                            fileIdMap.set(fileId, id);
                            return fileId;
                        });

                        const docs = await BaileysAuth.find({
                            sessionId,
                            fileId: { $in: fileIds }
                        }).lean();

                        for (const doc of docs) {
                            if (doc && doc.data) {
                                try {
                                    let value = JSON.parse(doc.data, BufferJSON.reviver);
                                    if (type === 'app-state-sync-key' && value) {
                                        value = proto.Message.AppStateSyncKeyData.fromObject(value);
                                    }
                                    const origId = fileIdMap.get(doc.fileId);
                                    if (origId) {
                                        data[origId] = value;
                                    }
                                } catch (parseErr) {
                                    console.error(`[BaileysAuth] CRITICAL: Persisted key '${doc.fileId}' for session '${sessionId}' is corrupted:`, parseErr.message);
                                    // P0 Rule: Corrupt persisted key must produce explicit integrity error, NEVER silently convert to null!
                                    throw new BaileysAuthKeyCorruptionError(`Persisted key '${doc.fileId}' for session '${sessionId}' is corrupted and cannot be deserialized`, parseErr, { sessionId, fileId: doc.fileId, type });
                                }
                            }
                        }
                    } catch (error) {
                        if (error instanceof BaileysAuthKeyCorruptionError) {
                            throw error;
                        }
                        console.error(`[BaileysAuth] Database batch read error for type ${type}, session ${sessionId}:`, error.message);
                        // Explicit failure semantics: A database/network failure must NOT be disguised as missing keys!
                        throw new BaileysAuthDatabaseError(`Database query failed during keys.get for type '${type}'`, error, { sessionId, type });
                    }

                    // Fill genuinely absent keys with null only when the database read was successful and key was not found
                    for (const id of ids) {
                        if (data[id] === undefined) {
                            data[id] = null;
                        }
                    }

                    return data;
                },
                set: async (data) => {
                    const operations = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const fileId = `${category}-${id}`;
                            if (value) {
                                operations.push({
                                    updateOne: {
                                        filter: { sessionId, fileId },
                                        update: { $set: { data: JSON.stringify(value, BufferJSON.replacer) } },
                                        upsert: true
                                    }
                                });
                            } else {
                                operations.push({
                                    deleteOne: {
                                        filter: { sessionId, fileId }
                                    }
                                });
                            }
                        }
                    }

                    if (operations.length > 0) {
                        try {
                            await BaileysAuth.bulkWrite(operations, { ordered: false });
                        } catch (error) {
                            console.error(`[BaileysAuth] Bulk write error for session ${sessionId}:`, error.message);
                            if (integrationId) {
                                import('../WhatsAppCircuitBreaker.js').then(({ default: WhatsAppCircuitBreaker }) => {
                                    WhatsAppCircuitBreaker.recordAuthFailure(integrationId, error).catch(() => {});
                                }).catch(() => {});
                            }

                            throw new BaileysAuthDatabaseError(`Failed to persist keys bulkWrite for session '${sessionId}'`, error, { sessionId });
                        }
                    }
                },
            },
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        },
    };
};
