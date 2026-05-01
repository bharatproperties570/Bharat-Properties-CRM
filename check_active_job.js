import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
});

async function checkJob() {
    try {
        const marketingQueue = new Queue('marketingQueue', { connection });
        const jobs = await marketingQueue.getJobs(['active']);
        if (jobs.length > 0) {
            const job = jobs[0];
            console.log(`Active Job ID: ${job.id}`);
            console.log(`Progress: ${job.progress}%`);
            console.log(`Data: ${JSON.stringify(job.data).substring(0, 500)}...`);
            
            const logs = await marketingQueue.getJobLogs(job.id);
            console.log('\n--- JOB LOGS ---');
            logs.logs.slice(-10).forEach(l => console.log(l));
        } else {
            console.log('No active jobs found.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkJob();
