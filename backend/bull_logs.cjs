const { Queue } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

async function check() {
    const redis = new Redis(process.env.REDIS_URI);
    const mq = new Queue('marketingQueue', {connection: redis});
    const completed = await mq.getJobs(['completed']);
    for (const job of completed) {
        if (job.name === 'auto-match-dispatch') {
            const logs = await mq.getJobLogs(job.id);
            console.log('Job:', job.id, 'Data:', JSON.stringify(job.data), 'Logs:', JSON.stringify(logs.logs));
        }
    }
    process.exit(0);
}
check();
