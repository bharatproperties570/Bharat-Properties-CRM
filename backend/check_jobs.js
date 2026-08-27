import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    const redis = new IORedis(process.env.REDIS_URI);
    const q = new Queue('marketingQueue', { connection: redis });
    const completed = await q.getJobs(['completed', 'failed', 'delayed']);
    const targetJobs = completed.filter(j => j.data && j.data.leadId === '6a86f784dc69abb10bb5c547');
    console.log(JSON.stringify(targetJobs.map(j => ({ id: j.id, state: j.finishedOn ? 'completed' : 'other', return: j.returnvalue, data: j.data })), null, 2));
    process.exit(0);
}
run();
