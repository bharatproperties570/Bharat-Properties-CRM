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

export const safeRedisCall = async (method, ...args) => {
    try {
        if (!redisConnection || redisConnection.status !== 'ready') return null;
        
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis Timeout')), 1000)
        );
        
        return await Promise.race([
            redisConnection[method](...args),
            timeout
        ]);
    } catch (err) {
        return null;
    }
};

export const invalidateDashboardCache = async () => {
    await safeRedisCall('del', 'dashboard_kpis_v2');
};

export default redisConnection;
