import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const redis = new IORedis(process.env.REDIS_URI);
    const q = new Queue('marketingQueue', { connection: redis });
    const completed = await q.getJobs(['completed']);
    const failed = await q.getJobs(['failed']);
    const delayed = await q.getJobs(['delayed']);
    const active = await q.getJobs(['active']);

    console.log('--- COMPLETED JOBS ---');
    completed.slice(-5).forEach(j => console.log(j.name, j.id, j.returnvalue));
    
    console.log('--- FAILED JOBS ---');
    failed.slice(-5).forEach(j => console.log(j.name, j.id, j.failedReason));

    console.log('--- DELAYED JOBS ---');
    delayed.forEach(j => console.log(j.name, j.id, 'Delayed until:', new Date(j.timestamp + j.delay).toISOString()));

    process.exit(0);
}
run();
