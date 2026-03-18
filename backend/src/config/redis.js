import Redis from "ioredis";

// Standardize the Redis connection for BullMQ
const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy(times) {
        // Return null to stop retrying after 3 times if we are in development
        if (times > 3 && process.env.NODE_ENV !== 'production') {
            console.warn('❌ Redis connection failed. Proceeding without Redis (Queues will be disabled).');
            return null; 
        }
        return Math.min(times * 100, 3000);
    }
});

redisConnection.on('error', (err) => {
    // console.warn('⚠️ Redis Connection Error:', err.message);
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
