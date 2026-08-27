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
    const completed = await q.getJobs(['completed']);
    const failed = await q.getJobs(['failed']);
    const active = await q.getJobs(['active']);
    console.log('ACTIVE:', active.length);
    console.log('FAILED:', failed.slice(-1).map(j => j.failedReason));
    console.log('COMPLETED:', completed.slice(-2).map(j => j.returnvalue));
    process.exit(0);
}
run();
