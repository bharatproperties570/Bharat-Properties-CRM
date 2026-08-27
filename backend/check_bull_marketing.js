import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const redis = new Redis(process.env.REDIS_URI || 'redis://127.0.0.1:6379');
    const q = new Queue('marketingQueue', { connection: redis });
    
    const states = ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'];
    for (const state of states) {
        const jobs = await q.getJobs([state]);
        console.log(`--- ${state.toUpperCase()} --- ${jobs.length}`);
        if (jobs.length > 0) {
            console.log(jobs.map(j => ({ id: j.id, name: j.name, data: j.data, timestamp: j.timestamp })).slice(0, 3));
        }
    }
    process.exit(0);
}
run();
