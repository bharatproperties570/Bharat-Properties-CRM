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
        await redisConnection.del('dashboard_kpis');
    } catch (err) {
        // Silently fail
    }
};

export default redisConnection;
