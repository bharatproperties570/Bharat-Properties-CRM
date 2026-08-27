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
    console.log(completed[completed.length-1].returnvalue);
    process.exit(0);
}
run();
