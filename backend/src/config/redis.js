import Redis from "ioredis";

// Senior Professional Implementation: MockRedis Fallback
// This ensures productivity and stability in development environments without a local redis-server.
class MockRedis {
    constructor() {
        this.data = new Map();
        this.status = 'ready';
        this.isMock = true;
        console.warn('⚠️  Redis: OPERATING IN MOCK MODE (In-memory fallback activated)');
    }
    async get(key) { return this.data.get(key) || null; }
    async set(key, val) { this.data.set(key, val); return 'OK'; }
    async del(key) { this.data.delete(key); return 1; }
    async quit() { return 'OK'; }
    on(event, cb) { 
        if (event === 'ready' || event === 'connect') setTimeout(cb, 10); 
        return this; 
    }
    once(event, cb) { 
        if (event === 'ready' || event === 'connect') setTimeout(cb, 10); 
        return this; 
    }
    async ping() { return 'PONG'; }
}

// Standardize the Redis connection for BullMQ
const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1', // Standardizing on 127.0.0.1 for Mac/Linux stability
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy(times) {
        // Stop retrying after 3 attempts in development to prevent log spam and trigger fallback
        if (times > 3 && process.env.NODE_ENV !== 'production') {
            console.warn('❌ Redis connection failed. Entering Mock Fallback mode.');
            return null; 
        }
        return Math.min(times * 200, 2000);
    }
};

let redisConnection;
let isRedisOnline = false;

try {
    redisConnection = new Redis(redisOptions);
    
    redisConnection.on('ready', () => {
        isRedisOnline = true;
        console.log('✅ Redis connected successfully');
    });

    redisConnection.on('error', (err) => {
        isRedisOnline = false;
        // If connection fails in development, fallback to mock to prevent crashes
        if (process.env.NODE_ENV !== 'production' && !redisConnection.isMock) {
            console.warn('❌ Redis Error: Forcing Mock mode fallback...');
            redisConnection = new MockRedis();
            isRedisOnline = true;
        }
    });
} catch (err) {
    console.error('CRITICAL: Redis instantiation error. Forcing mock.', err);
    redisConnection = new MockRedis();
    isRedisOnline = true;
}

export { isRedisOnline };

export const safeRedisCall = async (method, ...args) => {
    try {
        if (!redisConnection) return null;
        
        // Handle mock calls bypass
        if (redisConnection.isMock) {
            return await redisConnection[method](...args);
        }

        if (!isRedisOnline) return null;
        
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

export const invalidateDashboardCache = async (userId) => {
    if (userId) {
        await safeRedisCall('del', `dashboard_kpis_v2_${userId}`);
    } else {
        // Clear all dashboard caches
        const keys = await safeRedisCall('keys', 'dashboard_kpis_v2_*');
        if (keys && keys.length > 0) {
            await Promise.all(keys.map(key => safeRedisCall('del', key)));
        }
    }
};

export default redisConnection;

