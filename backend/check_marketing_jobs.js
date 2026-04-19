
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({ 
    host: '127.0.0.1', 
    port: 6379,
    maxRetriesPerRequest: null 
});

async function checkQueue() {
    console.log('--- CHECKING MARKETING QUEUE ---');
    const queue = new Queue('marketingQueue', { connection });
    
    // Check job counts
    const counts = await queue.getJobCounts();
    console.log('Current Counts:', counts);

    const jobs = await queue.getJobs(['completed', 'failed', 'active', 'waiting', 'delayed']);
    console.log(`Total jobs fetched: ${jobs.length}`);
    
    // Sort by timestamp descending
    const sortedJobs = jobs.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    
    for (const job of sortedJobs) {
        console.log(`\nJob ID: ${job.id}`);
        console.log(`Name: ${job.name}`);
        console.log(`Status: ${await job.getState()}`);
        console.log(`Timestamp: ${new Date(job.timestamp).toLocaleString()}`);
        console.log(`Data Leads Count: ${job.data?.leads?.length || 0}`);
        console.log(`Result: ${JSON.stringify(job.returnvalue)}`);
        
        if (job.stacktrace && job.stacktrace.length > 0) {
            console.log(`Error: ${job.stacktrace[0]}`);
        }
        
        const logs = await queue.getJobLogs(job.id);
        console.log(`Logs: ${logs.logs.slice(-5).join(' | ')}`);
    }
    
    await connection.quit();
}

checkQueue().catch(err => {
    console.error(err);
    process.exit(1);
});
