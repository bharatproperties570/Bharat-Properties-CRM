import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        const redis = new IORedis(process.env.REDIS_URI);
        const q = new Queue('crm-automation-queue', { connection: redis });
        
        const delayed = await q.getJobs(['delayed']);
        const active = await q.getJobs(['active']);
        const failed = await q.getJobs(['failed']);
        
        console.log('DELAYED COUNT:', delayed.length);
        if (delayed.length > 0) {
            delayed.forEach(j => {
                console.log('ID:', j.id, 'Data:', j.data.action?.type, 'Delayed Until:', new Date(j.timestamp + j.delay).toISOString());
            });
        }
        
        console.log('ACTIVE COUNT:', active.length);
        console.log('FAILED COUNT:', failed.length);
        if (failed.length > 0) {
            failed.forEach(j => console.log('ID:', j.id, 'Reason:', j.failedReason));
        }
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
run();
