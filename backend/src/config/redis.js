import Redis from "ioredis";

// Standardize the Redis connection for BullMQ
const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
});

redisConnection.on('error', (err) => {
    // console.warn('⚠️ BullMQ Redis Connection Error (if Redis is not running locally):', err.message);
});

export const invalidateDashboardCache = async () => {
    try {
        // Use a short timeout to prevent hanging if Redis is offline
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis Timeout')), 500)
        );
        await Promise.race([
            redisConnection.del('dashboard_kpis'),
            timeout
        ]);
    } catch (err) {
        // Silently fail if Redis is down
        // console.warn('⚠️ Cache invalidation skipped: Redis offline or timed out.');
    }
};

export default redisConnection;
