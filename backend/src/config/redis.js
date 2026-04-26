import Redis from "ioredis";
import { EventEmitter } from 'events';

// Senior Professional Implementation: MockRedis Fallback
// This ensures productivity and stability in development environments without a local redis-server.
class MockRedis extends EventEmitter {
    constructor() {
        super();
        this.data = new Map();
        this.status = 'ready';
        this.isMock = true;
        console.warn('⚠️  Redis: OPERATING IN MOCK MODE (In-memory fallback activated)');
        setTimeout(() => {
            this.emit('ready');
            this.emit('connect');
        }, 10);
    }
    setMaxListeners(n) { return this; }
    getMaxListeners() { return 100; }
    async get(key) { return this.data.get(key) || null; }
    async set(key, val) { this.data.set(key, val); return 'OK'; }
    async del(key) { this.data.delete(key); return 1; }
    async quit() { return 'OK'; }
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

let internalConnection;
let isRedisOnline = false;

// Initialize connection
try {
    internalConnection = new Redis(redisOptions);
    internalConnection.isMock = false; // Explicitly mark as not mock
    
    internalConnection.on('ready', () => {
        isRedisOnline = true;
        console.log('✅ Redis connected successfully');
    });

    internalConnection.on('error', (err) => {
        isRedisOnline = false;
        // If connection fails in development, fallback to mock to prevent crashes
        if (process.env.NODE_ENV !== 'production' && !internalConnection.isMock) {
            console.warn('❌ Redis Error: Forcing Mock mode fallback...');
            internalConnection = new MockRedis();
            isRedisOnline = true;
        }
    });
} catch (err) {
    console.error('CRITICAL: Redis instantiation error. Forcing mock.', err);
    internalConnection = new MockRedis();
    isRedisOnline = true;
}

/**
 * SENIOR PROFESSIONAL IMPLEMENTATION: Redis Proxy
 * Since ESM default exports are not live bindings, we use a Proxy to ensure
 * that any module importing 'redisConnection' always interacts with the 
 * current active connection (Real or Mock).
 */
const redisProxy = new Proxy({}, {
    get: (target, prop) => {
        // Handle special properties
        if (prop === 'isMock') return internalConnection.isMock;
        if (prop === 'status') return internalConnection.status;
        
        const value = internalConnection[prop];
        if (typeof value === 'function') {
            return value.bind(internalConnection);
        }
        return value;
    }
});

export { isRedisOnline };

export const safeRedisCall = async (method, ...args) => {
    try {
        if (internalConnection.isMock) {
            return await internalConnection[method](...args);
        }

        if (!isRedisOnline) return null;
        
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis Timeout')), 1000)
        );
        
        return await Promise.race([
            internalConnection[method](...args),
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

export default redisProxy;

