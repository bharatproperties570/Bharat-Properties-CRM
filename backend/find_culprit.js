
const files = [
    './src/config/redis.js',
    './services/WhatsAppService.js',
    './services/MarketingService.js',
    './services/MarketingAudienceService.js',
    './services/CampaignEngine.js',
    './src/workers/marketingWorker.js',
    './app.js',
    './src/server.js'
];

async function check() {
    for (const file of files) {
        try {
            await import(file);
            console.log(`✅ ${file} LOADED`);
        } catch (e) {
            console.log(`❌ ${file} FAILED:`);
            console.log(e.stack || e);
        }
    }
}
check();
