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
    const target = completed.filter(j => j.data.leadId === '6a870e983a327c63243a94b1');
    console.log(target.map(j => ({ id: j.id, ret: j.returnvalue, time: new Date(j.finishedOn) })));
    process.exit(0);
}
run();
