import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    try {
        const redis = new IORedis(process.env.REDIS_URI, { maxRetriesPerRequest: null });
        const q = new Queue('marketingQueue', { connection: redis });
        
        const completed = await q.getJobs(['completed']);
        const failed = await q.getJobs(['failed']);
        
        console.log('--- FAILED ---');
        for (let j of failed.slice(-5)) {
            console.log(j.id, j.name, j.failedReason);
            const logs = await j.getLogs();
            console.log('Logs:', logs);
        }
        
        console.log('--- COMPLETED ---');
        for (let j of completed.slice(-5)) {
            console.log(j.id, j.name, JSON.stringify(j.returnvalue));
            const logs = await j.getLogs();
            console.log('Logs:', logs);
        }
        
        console.log('Done');
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
