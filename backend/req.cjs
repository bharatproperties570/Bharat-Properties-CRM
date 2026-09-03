const { Queue } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

async function r() {
    const redis = new Redis({ host: '127.0.0.1', port: 6379, password: process.env.REDIS_PASSWORD });
    const mq = new Queue('crm-automation-queue', {connection: redis});
    
    // Process stuck delayed jobs
    const delayed = await mq.getJobs(['delayed']);
    const now = Date.now();
    let stuck = 0;
    
    for (const job of delayed) {
        if (job.timestamp + job.delay < now) {
            console.log('Stuck delayed job:', job.id, 'Delay was:', job.delay);
            stuck++;
        }
    }
    console.log('Total delayed:', delayed.length, 'Stuck:', stuck);
    process.exit(0);
}
r();
