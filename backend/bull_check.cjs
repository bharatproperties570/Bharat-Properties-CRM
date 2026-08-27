const { Queue } = require('bullmq');
const Redis = require('ioredis');
const connection = new Redis({ host: '127.0.0.1', port: 6379, password: 'SecureRedisP@ss2026' });
const queues = ['enrichmentQueue', 'notificationQueue', 'cronQueue', 'googleSyncQueue', 'marketingQueue', 'distributionQueue', 'IntakeQueue', 'automationQueue'];

async function run() {
  console.log("--- BullMQ Queues ---");
  for (const name of queues) {
    try {
        const q = new Queue(name, { connection });
        const counts = await q.getJobCounts();
        console.log(`${name}: Wait=${counts.waiting}, Act=${counts.active}, Del=${counts.delayed}, Fail=${counts.failed}, Comp=${counts.completed}`);
        await q.close();
    } catch(e) {
        console.log(`${name}: Error - ${e.message}`);
    }
  }
  process.exit(0);
}
run();
