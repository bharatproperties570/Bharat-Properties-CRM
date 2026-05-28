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
        const q = new Queue('UnifiedIntakeQueue', { connection });
        const counts = await q.getJobCounts();
        console.log('--- UNIFIED INTAKE QUEUE JOB COUNTS ---');
        console.log(`Waiting: ${counts.waiting}`);
        console.log(`Active: ${counts.active}`);
        console.log(`Completed: ${counts.completed}`);
        console.log(`Failed: ${counts.failed}`);
        console.log(`Delayed: ${counts.delayed}`);
        
        const jobs = await q.getJobs(['waiting', 'active', 'failed'], 0, 10, true);
        console.log('\n--- RECENT JOBS ---');
        jobs.forEach(j => {
            console.log(`ID: ${j.id} | Name: ${j.name} | State: ${j.failedReason ? 'Failed: ' + j.failedReason : 'Pending'}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkQueue();
