import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const redis = new IORedis({ password: process.env.REDIS_PASSWORD });
    const mq = new Queue('marketingQueue', { connection: redis });
    const comp = await mq.getJobs(['completed']);
    for (const j of comp.slice(-5)) {
        console.log('ID:', j.id, 'RETURN:', j.returnvalue);
    }
    process.exit(0);
}
run();
