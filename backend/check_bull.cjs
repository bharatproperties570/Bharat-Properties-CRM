const { Queue } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

async function check() {
    const redis = new Redis(process.env.REDIS_URI);
    const q = new Queue('crm-automation-queue', {connection: redis});
    const jobs = await q.getJobs(['waiting', 'delayed', 'active', 'failed']);
    console.log('CRM Queue:', jobs.length, jobs.map(j => ({id: j.id, name: j.name, state: j.opts.delay ? 'delayed' : 'immediate'})));
    const mq = new Queue('marketingQueue', {connection: redis});
    const mjobs = await mq.getJobs(['waiting', 'delayed', 'active', 'failed']);
    console.log('Marketing Queue:', mjobs.length, mjobs.map(j => ({id: j.id, name: j.name, state: j.opts.delay ? 'delayed' : 'immediate'})));
    process.exit(0);
}
check();
