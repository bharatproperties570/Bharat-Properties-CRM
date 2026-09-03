import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const redis = new IORedis({ password: process.env.REDIS_PASSWORD });
    const q = new Queue('automationQueue', { connection: redis });
    const delayed = await q.getJobs(['delayed']);
    const failed = await q.getJobs(['failed']);
    const completed = await q.getJobs(['completed']);
    console.log('--- DELAYED automationQueue ---');
    console.log(delayed.map(j => ({ id: j.id, name: j.name, data: j.data, timestamp: j.timestamp, delay: j.delay })));
    console.log('--- FAILED automationQueue ---');
    console.log(failed.map(j => ({ id: j.id, name: j.name, fail: j.failedReason })));
    
    const mq = new Queue('marketingQueue', { connection: redis });
    const m_delayed = await mq.getJobs(['delayed']);
    const m_failed = await mq.getJobs(['failed']);
    console.log('--- DELAYED marketingQueue ---');
    console.log(m_delayed.map(j => ({ id: j.id, name: j.name })));
    console.log('--- FAILED marketingQueue ---');
    console.log(m_failed.map(j => ({ id: j.id, name: j.name, fail: j.failedReason })));

    process.exit(0);
}
run();
