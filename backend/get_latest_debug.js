import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Check latest lead
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const latestLead = await Lead.findOne({}).sort({createdAt: -1}).lean();
    console.log('--- LATEST LEAD ---');
    console.log('ID:', latestLead._id, 'Name:', latestLead.firstName, 'Created:', latestLead.createdAt);

    // Check Automation Logs
    const AutomationLog = mongoose.model('AutomationLog', new mongoose.Schema({}, { strict: false }));
    const autoLogs = await AutomationLog.find({ targetEntityId: latestLead._id }).sort({createdAt: -1}).lean();
    console.log('\n--- AUTOMATION LOGS FOR LEAD ---');
    console.log(JSON.stringify(autoLogs, null, 2));

    // Check BullMQ marketingQueue
    const redisOptions = {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || 'SecureRedisP@ss2026',
        maxRetriesPerRequest: null
    };
    const redis = new IORedis(redisOptions);
    const mq = new Queue('marketingQueue', { connection: redis });
    const completed = await mq.getJobs(['completed']);
    const failed = await mq.getJobs(['failed']);
    
    console.log('\n--- MARKETING QUEUE FAILED ---');
    failed.slice(-5).forEach(j => {
        console.log('ID:', j.id, 'Name:', j.name, 'Reason:', j.failedReason);
    });
    console.log('\n--- MARKETING QUEUE COMPLETED ---');
    completed.slice(-5).forEach(j => {
        console.log('ID:', j.id, 'Name:', j.name, 'Return:', JSON.stringify(j.returnvalue).substring(0, 100));
    });

    process.exit(0);
}
run();
