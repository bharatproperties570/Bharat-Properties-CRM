import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import BaileysAuth from '../../models/BaileysAuth.js';

export const useMongoDBAuthState = async (sessionId) => {
    const writeData = async (data, fileId) => {
        try {
            await BaileysAuth.updateOne(
                { sessionId, fileId },
                { $set: { data: JSON.stringify(data, BufferJSON.replacer) } },
                { upsert: true }
            );
        } catch (error) {
            console.error(`[BaileysAuth] Error writing to MongoDB for session ${sessionId} and file ${fileId}:`, error);
        }
    };

    const readData = async (fileId) => {
        try {
            const document = await BaileysAuth.findOne({ sessionId, fileId });
            if (document && document.data) {
                return JSON.parse(document.data, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error(`[BaileysAuth] Error reading from MongoDB for session ${sessionId} and file ${fileId}:`, error);
            return null;
        }
    };

    const removeData = async (fileId) => {
        try {
            await BaileysAuth.deleteOne({ sessionId, fileId });
        } catch (error) {
            console.error(`[BaileysAuth] Error removing from MongoDB for session ${sessionId} and file ${fileId}:`, error);
        }
    };

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
                                    console.error(`[BaileysAuth] Parse error for ${doc.fileId}:`, parseErr.message);
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`[BaileysAuth] Batch read error for type ${type}:`, error.message);
                    }

                    // Fill missing keys with null
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
