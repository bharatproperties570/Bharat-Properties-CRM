const { Queue } = require('bullmq');
const Redis = require('ioredis');
const connection = new Redis({ host: '127.0.0.1', port: 6379, password: 'SecureRedisP@ss2026' });
const queues = ['enrichmentQueue', 'notificationQueue', 'marketingQueue', 'distributionQueue', 'IntakeQueue', 'automationQueue'];

async function inspect() {
  for (const name of queues) {
    const q = new Queue(name, { connection });
    const failed = await q.getFailed();
    if (failed.length > 0) {
      console.log(`=== ${name} ===`);
      console.log(`Failed: ${failed.length}`);
      for (let j of failed) {
          console.log(`[Fail] ID: ${j.id}, Name: ${j.name}, Err: ${j.failedReason}`);
      }
    }
    await q.close();
  }
  console.log("Done checking other queues.");
  process.exit(0);
}
inspect();
