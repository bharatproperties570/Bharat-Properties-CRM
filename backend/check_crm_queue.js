import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    const redis = new IORedis(process.env.REDIS_URI);
    const q = new Queue('crm-automation-queue', { connection: redis });
    const completed = await q.getJobs(['completed', 'failed', 'delayed']);
    const failed = await q.getJobs(['failed']);
    console.log('--- DELAYED ---');
    console.log(await q.getJobs(['delayed']));
    console.log('--- FAILED ---');
    failed.forEach(j => { console.log(j.id, j.failedReason, j.data?.action?.automatedActionId); });
    console.log('--- COMPLETED ---', completed.length);
    process.exit(0);
}
run();
