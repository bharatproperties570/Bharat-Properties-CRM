import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const redis = new IORedis(process.env.REDIS_URI);
    const q = new Queue('marketingQueue', { connection: redis });
    const jobs = await q.getJobs(['completed', 'failed', 'active', 'delayed']);
    const autoMatchJobs = jobs.filter(j => j.name === 'auto-match-dispatch');
    if (autoMatchJobs.length > 0) {
        const j = autoMatchJobs[0];
        console.log('Status:', await j.getState());
        console.log('Progress:', j.progress);
        console.log('Return Value:', j.returnvalue);
        console.log('Failed Reason:', j.failedReason);
        const logs = await j.getLogs();
        console.log('Logs:', logs);
    } else {
        console.log('No job found');
    }
    process.exit(0);
}
run();
