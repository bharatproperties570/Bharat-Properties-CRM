const { Queue } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

async function check() {
    const redis = new Redis(process.env.REDIS_URI);
    const q = new Queue('crm-automation-queue', {connection: redis});
    const delayed = await q.getJobs(['delayed', 'waiting', 'active', 'failed']);
    for (const job of delayed) {
        if (job.data && job.data.entityData && (job.data.entityData._id === '6a8850bfad29dcd4c63e1890' || job.data.entityData.id === '6a8850bfad29dcd4c63e1890')) {
            console.log('Found job for lead:', job.id, job.opts, job.delay);
        }
    }
    console.log('Total jobs in CRM Automation:', delayed.length);
    process.exit(0);
}
check();
