import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
});

async function checkQueue() {
    try {
        const marketingQueue = new Queue('marketingQueue', { connection });
        const counts = await marketingQueue.getJobCounts();
        console.log('--- MARKETING QUEUE JOB COUNTS ---');
        console.log(`Waiting: ${counts.waiting}`);
        console.log(`Active: ${counts.active}`);
        console.log(`Completed: ${counts.completed}`);
        console.log(`Failed: ${counts.failed}`);
        console.log(`Delayed: ${counts.delayed}`);
        
        const jobs = await marketingQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, 10, true);
        console.log('\n--- RECENT JOBS ---');
        jobs.forEach(j => {
            console.log(`ID: ${j.id} | Name: ${j.name} | Progress: ${j.progress}% | State: ${j.finishedOn ? 'Finished' : 'Running'}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkQueue();
