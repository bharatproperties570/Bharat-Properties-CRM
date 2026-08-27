const { Queue } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

async function check() {
    const redis = new Redis(process.env.REDIS_URI);
    const q = new Queue('crm-automation-queue', {connection: redis});
    const failed = await q.getJobs(['failed']);
    let out = 'Failed in CRM Queue: ' + failed.length + '\n';
    for (const f of failed) {
        if (f.data && f.data.entityData && f.data.entityData._id === '6a8850bfad29dcd4c63e1890') {
            out += 'Lead 6a88 failed: ' + f.failedReason + '\n';
        }
    }
    const delayed = await q.getJobs(['delayed']);
    out += 'Delayed in CRM Queue: ' + delayed.length + '\n';
    require('fs').writeFileSync('bull_out.txt', out);
    process.exit(0);
}
check();
