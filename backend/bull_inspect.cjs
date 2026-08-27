const { Queue } = require('bullmq');
const Redis = require('ioredis');
const connection = new Redis({ host: '127.0.0.1', port: 6379, password: 'SecureRedisP@ss2026' });

async function inspect() {
  const cronQ = new Queue('cronQueue', { connection });
  const cronDelayed = await cronQ.getDelayed();
  const cronFailed = await cronQ.getFailed();
  
  console.log("=== cronQueue ===");
  console.log(`Failed: ${cronFailed.length}`);
  for (let j of cronFailed) {
      console.log(`[Fail] ID: ${j.id}, Name: ${j.name}, Err: ${j.failedReason}`);
  }
  console.log(`Delayed: ${cronDelayed.length}`);
  for (let j of cronDelayed) {
      console.log(`[Delay] ID: ${j.id}, Name: ${j.name}, Timestamp: ${new Date(j.timestamp).toISOString()}, Delay: ${j.delay}, ProcessAt: ${new Date(j.timestamp + j.delay).toISOString()}`);
  }

  const syncQ = new Queue('googleSyncQueue', { connection });
  const syncDelayed = await syncQ.getDelayed();
  const syncFailed = await syncQ.getFailed();
  
  console.log("\n=== googleSyncQueue ===");
  console.log(`Failed: ${syncFailed.length}`);
  console.log(`Delayed: ${syncDelayed.length}`);
  for (let j of syncDelayed) {
      console.log(`[Delay] ID: ${j.id}, Name: ${j.name}, Timestamp: ${new Date(j.timestamp).toISOString()}, Delay: ${j.delay}, ProcessAt: ${new Date(j.timestamp + j.delay).toISOString()}`);
  }
  
  await cronQ.close();
  await syncQ.close();
  process.exit(0);
}
inspect();
