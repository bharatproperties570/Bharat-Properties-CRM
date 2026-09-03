import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        const redisOptions = {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || 'SecureRedisP@ss2026',
            maxRetriesPerRequest: null
        };
        const redis = new IORedis(redisOptions);
        const q = new Queue('crm-automation-queue', { connection: redis });
        
        const delayed = await q.getJobs(['delayed']);
        const failed = await q.getJobs(['failed']);
        
        console.log('--- crm-automation-queue DELAYED ---', delayed.length);
        if (delayed.length > 0) {
            delayed.forEach(j => {
                console.log('ID:', j.id, 'Delayed Until:', new Date(j.timestamp + j.delay).toISOString());
            });
        }
        console.log('--- crm-automation-queue FAILED ---', failed.length);
        failed.forEach(j => console.log('ID:', j.id, j.failedReason));
        
        const mq = new Queue('marketingQueue', { connection: redis });
        const mDelayed = await mq.getJobs(['delayed']);
        const mFailed = await mq.getJobs(['failed']);
        
        console.log('--- marketingQueue DELAYED ---', mDelayed.length);
        console.log('--- marketingQueue FAILED ---', mFailed.length);
        mFailed.forEach(j => console.log('ID:', j.id, j.failedReason));

    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
run();
