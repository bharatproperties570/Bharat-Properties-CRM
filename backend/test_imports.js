import dotenv from 'dotenv';
dotenv.config();

console.log('1. Importing env...');
await import('./src/config/env.js');

console.log('2. Importing db...');
await import('./src/config/db.js');

console.log('3. Importing redis...');
await import('./src/config/redis.js');

console.log('4. Importing queues/queueManager...');
await import('./src/queues/queueManager.js');

console.log('5. Importing enrichmentWorker...');
await import('./src/workers/enrichmentWorker.js');

console.log('6. Importing cronWorker...');
await import('./src/workers/cronWorker.js');

console.log('7. Importing googleSyncWorker...');
await import('./src/workers/googleSyncWorker.js');

console.log('8. Importing marketingWorker...');
await import('./src/workers/marketingWorker.js');

console.log('9. Importing IntakeQueue...');
await import('./services/intakeQueue/IntakeQueue.js');

console.log('10. Importing AutomatedIntakeService...');
await import('./services/intakeQueue/AutomatedIntakeService.js');

console.log('11. Importing GoogleDiscoveryService...');
await import('./services/discovery/GoogleDiscoveryService.js');

console.log('12. Importing NurtureBot...');
await import('./services/NurtureBot.js');

console.log('13. Importing redisLauncher...');
await import('./src/utils/redisLauncher.js');

console.log('✨ All imports completed successfully!');
process.exit(0);
