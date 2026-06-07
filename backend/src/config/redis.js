import Redis from "ioredis";
import { EventEmitter } from 'events';
import { Queue as BullQueue, Worker as BullWorker } from 'bullmq';

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
    async setex(key, seconds, val) { 
        this.data.set(key, val); 
        setTimeout(() => this.data.delete(key), seconds * 1000);
        return 'OK'; 
    }
    async del(key) { this.data.delete(key); return 1; }
    async quit() { return 'OK'; }
    async ping() { return 'PONG'; }
}

import { execSync } from "child_process";

// Standardize the Redis connection for BullMQ
const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1', // Standardizing on 127.0.0.1 for Mac/Linux stability
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy(times) {
        // Stop retrying after 3 attempts in development to prevent log spam and trigger fallback
        if (times > 3 && process.env.NODE_ENV !== 'production') {
            return null; 
        }
        return Math.min(times * 200, 2000);
    }
};

let internalConnection;
let isRedisOnline = false;

// Senior Professional Implementation: Pre-check Redis Availability
// This prevents BullMQ from binding to a dead connection during initial import.
let redisExists = false;
try {
    // Quick port check using nc (netcat) or lsof
    execSync(`nc -z -w 1 ${redisOptions.host} ${redisOptions.port}`);
    redisExists = true;
} catch (e) {
    redisExists = false;
}

if (!redisExists) {
    console.warn('⚠️  Redis server not detected on port 6379. Pre-emptively starting in MOCK MODE.');
    internalConnection = new MockRedis();
    isRedisOnline = true;
} else {
    // Initialize connection normally
    try {
        internalConnection = new Redis(redisOptions);
        internalConnection.isMock = false;
        
        internalConnection.on('ready', () => {
            isRedisOnline = true;
            console.log('✅ Redis connected successfully');
        });

        internalConnection.on('error', (err) => {
            isRedisOnline = false;
            if (!internalConnection.isMock) {
                console.warn('❌ Redis Error: Forcing Mock mode fallback...');
                const oldConn = internalConnection;
                internalConnection = new MockRedis();
                isRedisOnline = true;
                try { oldConn.disconnect(); } catch (e) {}
            }
        });
    } catch (err) {
        internalConnection = new MockRedis();
        isRedisOnline = true;
    }
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

// Senior Professional Wrapper: Dynamic Queue and Worker mocking
const mockQueues = new Map();
const mockWorkers = new Map();

export class Queue {
    constructor(name, opts = {}) {
        if (internalConnection.isMock) {
            this.name = name;
            mockQueues.set(name, this);
            console.log(`[MockQueue] Registered mock queue: ${name}`);
            return this;
        }
        return new BullQueue(name, opts);
    }
    async add(name, data, opts) {
        const jobId = `mock-${Date.now()}`;
        if (internalConnection.isMock) {
            const worker = mockWorkers.get(this.name);
            if (worker && worker.processor) {
                setTimeout(async () => {
                    const mockJob = {
                        id: jobId,
                        name: name,
                        data: data,
                        progress: 0,
                        opts: opts || {}
                    };
                    try {
                        console.log(`[MockQueue] Processing job ${jobId} on queue ${this.name}`);
                        await worker.processor(mockJob);
                        worker.emit('completed', mockJob);
                    } catch (err) {
                        console.error(`[MockQueue] Job ${jobId} failed:`, err);
                        worker.emit('failed', mockJob, err);
                    }
                }, 50);
            }
        }
        return { id: jobId };
    }
    on(event, cb) {
        return this;
    }
    async close() {
        return;
    }
}

export class Worker extends EventEmitter {
    constructor(name, processor, opts = {}) {
        super();
        if (internalConnection.isMock) {
            this.name = name;
            this.processor = processor;
            mockWorkers.set(name, this);
            console.log(`[MockWorker] Registered mock worker: ${name}`);
            return this;
        }
        return new BullWorker(name, processor, opts);
    }
    async close() {
        return;
    }
}

export default redisProxy;


