import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const redis = new IORedis(process.env.REDIS_URI);
    await redis.config('set', 'stop-writes-on-bgsave-error', 'no');
    console.log('Redis config updated!');
    process.exit(0);
}
run();
