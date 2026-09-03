import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const redis = new IORedis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || 'SecureRedisP@ss2026',
        maxRetriesPerRequest: null
    });
    const q = new Queue('marketingQueue', { connection: redis });
    await q.add('auto-match-dispatch', {
        leadId: '6a870e983a327c63243a94b1',
        toggles: { whatsapp: true },
        matchContext: 'perfect',
        companyId: '698b3303861a01e0b0816896'
    });
    console.log('Enqueued bypass to marketingQueue!');
    process.exit(0);
}
run();
