import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import config from '../../config/env.js';
import { BaileysConnectionManager } from './BaileysConnectionManager.js';

const connection = new IORedis(config.redisUri || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
});

export const baileysWorker = new Worker('whatsapp_baileys_outbound', async (job) => {
    const { integrationId, to, text, mediaUrl } = job.data;

    const sock = BaileysConnectionManager.getSocket(integrationId);
    if (!sock) {
        throw new Error(`[BaileysWorker] Socket not found or disconnected for integration ${integrationId}`);
    }

    try {
        // Simple JID parsing for phone numbers and groups
        const jid = to.includes('@s.whatsapp.net') || to.includes('@g.us') ? to : `${to}@s.whatsapp.net`;
        
        // Anti-ban pacing: 3 to 5 seconds jitter
        const jitter = Math.floor(Math.random() * 2000) + 3000;
        await new Promise(resolve => setTimeout(resolve, jitter));

        // Simulate human typing
        await sock.presenceSubscribe(jid);
        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sock.sendPresenceUpdate('paused', jid);

        await sock.sendMessage(jid, { text });

        return { success: true, jid };
    } catch (error) {
        console.error(`[BaileysWorker] Error sending message:`, error);
        throw error;
    }
}, { connection, concurrency: 1 });

baileysWorker.on('failed', (job, err) => {
    console.error(`[BaileysWorker] Job ${job.id} failed:`, err);
});
