import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    const redis = new IORedis(process.env.REDIS_URI);
    const q = new Queue('crm-automation-queue', { connection: redis });
    const delayed = await q.getJobs(['delayed']);
    const failed = await q.getJobs(['failed']);
    console.log('--- DELAYED ---');
    delayed.forEach(j => console.log(j.id, new Date(j.timestamp + j.delay).toISOString()));
    console.log('--- FAILED ---');
    failed.forEach(j => console.log(j.id, j.failedReason));
    process.exit(0);
}
run();
