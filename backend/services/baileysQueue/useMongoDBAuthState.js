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
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const fileId = `${category}-${id}`;
                            tasks.push(value ? writeData(value, fileId) : removeData(fileId));
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        },
    };
};
