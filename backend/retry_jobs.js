import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const redis = new IORedis({ password: process.env.REDIS_PASSWORD });
    const mq = new Queue('marketingQueue', { connection: redis });
    const failed = await mq.getJobs(['failed']);
    for (const j of failed) {
        if (j.name === 'auto-match-dispatch') {
            await j.retry();
            console.log('Retried job:', j.id);
        }
    }
    process.exit(0);
}
run();
