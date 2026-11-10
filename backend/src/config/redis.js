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
    async set(key, val, ...args) { 
        const argStrings = args.map(a => typeof a === 'string' ? a.toUpperCase() : a);
        const hasNX = argStrings.includes('NX');
        const hasXX = argStrings.includes('XX');
        if (hasNX && this.data.has(key)) return null;
        if (hasXX && !this.data.has(key)) return null;

        this.data.set(key, val);

        const exIdx = argStrings.indexOf('EX');
        if (exIdx !== -1 && args[exIdx + 1] !== undefined) {
            const sec = parseInt(args[exIdx + 1], 10);
            if (!isNaN(sec)) {
                setTimeout(() => this.data.delete(key), sec * 1000).unref();
            }
        }
        const pxIdx = argStrings.indexOf('PX');
        if (pxIdx !== -1 && args[pxIdx + 1] !== undefined) {
            const ms = parseInt(args[pxIdx + 1], 10);
            if (!isNaN(ms)) {
                setTimeout(() => this.data.delete(key), ms).unref();
            }
        }
        return 'OK'; 
    }
    async setex(key, seconds, val) { 
        this.data.set(key, val); 
        setTimeout(() => this.data.delete(key), seconds * 1000).unref();
        return 'OK'; 
    }
    async del(key) { this.data.delete(key); return 1; }
    async keys(pattern = '*') {
        if (!pattern || pattern === '*') return Array.from(this.data.keys());
        const regexStr = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
        const regex = new RegExp(regexStr);
        return Array.from(this.data.keys()).filter(k => regex.test(k));
    }
    async incr(key) {
        const current = parseInt(this.data.get(key) || '0', 10);
        const next = current + 1;
        this.data.set(key, String(next));
        return next;
    }
    async expire(key, seconds) {
        if (!this.data.has(key)) return 0;
        const val = this.data.get(key);
        setTimeout(() => {
            if (this.data.get(key) === val) {
                this.data.delete(key);
            }
        }, seconds * 1000).unref();
        return 1;
    }
    async mget(...keys) {
        const flatKeys = keys.flat();
        return flatKeys.map(k => this.data.get(k) || null);
    }
    async eval(script, numkeys, ...args) {
        const keys = args.slice(0, numkeys);
        const argv = args.slice(numkeys);
        const s = String(script || '');

        // Circuit Breaker: Check and reserve probe
        if (s.includes('CB_CHECK_AND_RESERVE_PROBE')) {
            const stateKey = keys[0];
            const reasonKey = keys[1];
            const trippedAtKey = keys[2];
            const probeLockKey = keys[3];

            const workerToken = argv[0];
            const cooloffMs = parseInt(argv[1], 10) || (5 * 60 * 1000);
            const probeTtlSec = parseInt(argv[2], 10) || 60;
            const nowMs = parseInt(argv[3], 10) || Date.now();
            const callerProbeToken = argv[4] || '';

            const state = this.data.get(stateKey) || 'CLOSED';

            if (state === 'CLOSED') {
                return JSON.stringify({ state: 'CLOSED', tripped: false });
            }

            if (state === 'OPEN') {
                const trippedAtRaw = this.data.get(trippedAtKey);
                const trippedAt = trippedAtRaw ? parseInt(trippedAtRaw, 10) : nowMs;
                const elapsed = nowMs - trippedAt;

                if (elapsed >= cooloffMs) {
                    if (this.data.has(probeLockKey)) {
                        return JSON.stringify({
                            state: 'OPEN',
                            tripped: true,
                            reason: 'Controlled probe already in flight by another worker. Holding dispatch.',
                            probeInFlight: true,
                            trippedAt
                        });
                    }
                    await this.set(probeLockKey, workerToken, 'NX', 'EX', probeTtlSec);
                    this.data.set(stateKey, 'HALF_OPEN');
                    return JSON.stringify({
                        state: 'HALF_OPEN',
                        tripped: false,
                        isProbe: true,
                        probeToken: workerToken
                    });
                } else {
                    const reason = this.data.get(reasonKey) || 'Circuit breaker tripped due to consecutive WhatsApp line failures';
                    const remainingSec = Math.max(0, Math.floor((cooloffMs - elapsed) / 1000));
                    return JSON.stringify({
                        state: 'OPEN',
                        tripped: true,
                        reason,
                        trippedAt,
                        remainingCooloffSec: remainingSec
                    });
                }
            }

            if (state === 'HALF_OPEN') {
                const activeToken = this.data.get(probeLockKey);
                if (!activeToken) {
                    const tripReason = 'Probe lease expired or worker crashed. Resetting cooloff.';
                    this.data.set(stateKey, 'OPEN');
                    this.data.set(trippedAtKey, String(nowMs));
                    this.data.set(reasonKey, tripReason);
                    return JSON.stringify({
                        state: 'OPEN',
                        tripped: true,
                        reason: tripReason,
                        trippedAt: nowMs,
                        recoveredFromExpiredLease: true,
                        remainingCooloffSec: Math.floor(cooloffMs / 1000)
                    });
                }

                if (callerProbeToken && callerProbeToken === activeToken) {
                    return JSON.stringify({
                        state: 'HALF_OPEN',
                        tripped: false,
                        isProbe: true,
                        probeToken: activeToken
                    });
                }

                return JSON.stringify({
                    state: 'HALF_OPEN',
                    tripped: true,
                    reason: 'Circuit breaker is in HALF_OPEN probe mode. Awaiting single test dispatch verification.',
                    probeInFlight: true
                });
            }

            return JSON.stringify({ state, tripped: false });
        }

        // Circuit Breaker: Record probe success
        if (s.includes('CB_RECORD_PROBE_SUCCESS')) {
            const stateKey = keys[0];
            const reasonKey = keys[1];
            const trippedAtKey = keys[2];
            const probeLockKey = keys[3];
            const timeoutsKey = keys[4];
            const authFailuresKey = keys[5];
            const disconnectsKey = keys[6];
            const probeToken = argv[0] || '';

            const state = this.data.get(stateKey) || 'CLOSED';

            if (state === 'HALF_OPEN') {
                if (!probeToken || probeToken === '') {
                    return JSON.stringify({ success: false, state, error: 'MISSING_PROBE_TOKEN' });
                }
                const activeToken = this.data.get(probeLockKey);
                if (!activeToken) {
                    return JSON.stringify({ success: false, state, error: 'EXPIRED_PROBE_LEASE' });
                }
                if (probeToken !== activeToken) {
                    return JSON.stringify({ success: false, state, error: 'STALE_PROBE_OWNER' });
                }

                this.data.set(stateKey, 'CLOSED');
                this.data.delete(reasonKey);
                this.data.delete(trippedAtKey);
                this.data.delete(probeLockKey);
                this.data.delete(timeoutsKey);
                this.data.delete(authFailuresKey);
                this.data.delete(disconnectsKey);
                return JSON.stringify({ success: true, state: 'CLOSED' });
            }

            if (state === 'CLOSED') {
                this.data.delete(timeoutsKey);
                this.data.delete(authFailuresKey);
                this.data.delete(disconnectsKey);
                return JSON.stringify({ success: true, state: 'CLOSED' });
            }

            return JSON.stringify({ success: false, state, error: 'BREAKER_NOT_HALF_OPEN' });
        }

        // Circuit Breaker: Record probe failure
        if (s.includes('CB_RECORD_PROBE_FAILURE')) {
            const stateKey = keys[0];
            const reasonKey = keys[1];
            const trippedAtKey = keys[2];
            const probeLockKey = keys[3];
            const probeToken = argv[0] || '';
            const failureReason = argv[1] || 'Probe dispatch failed';
            const nowMs = parseInt(argv[2], 10) || Date.now();

            const state = this.data.get(stateKey) || 'CLOSED';

            if (state === 'HALF_OPEN') {
                if (!probeToken || probeToken === '') {
                    return JSON.stringify({ success: false, state, error: 'MISSING_PROBE_TOKEN' });
                }
                const activeToken = this.data.get(probeLockKey);
                if (!activeToken) {
                    return JSON.stringify({ success: false, state, error: 'EXPIRED_PROBE_LEASE' });
                }
                if (probeToken !== activeToken) {
                    return JSON.stringify({ success: false, state, error: 'STALE_PROBE_OWNER' });
                }

                const tripReason = `Probe failed: ${failureReason}. Resetting cooloff.`;
                this.data.set(stateKey, 'OPEN');
                this.data.set(reasonKey, tripReason);
                this.data.set(trippedAtKey, String(nowMs));
                this.data.delete(probeLockKey);
                return JSON.stringify({ success: true, tripped: true, state: 'OPEN', reason: tripReason });
            }

            return JSON.stringify({ success: false, state, error: 'BREAKER_NOT_HALF_OPEN' });
        }

        // Circuit Breaker: Record failure counter (atomic increment, rolling TTL & trip)
        if (s.includes('CB_RECORD_FAILURE_COUNTER')) {
            const counterKey = keys[0];
            const stateKey = keys[1];
            const reasonKey = keys[2];
            const trippedAtKey = keys[3];
            const probeLockKey = keys[4];

            const threshold = parseInt(argv[0], 10);
            const counterTtlSec = parseInt(argv[1], 10) || 900;
            const tripReason = argv[2] || 'Circuit breaker tripped';
            const nowMs = parseInt(argv[3], 10) || Date.now();

            const current = parseInt(this.data.get(counterKey) || '0', 10);
            const count = current + 1;
            this.data.set(counterKey, String(count));
            await this.expire(counterKey, counterTtlSec);

            if (count >= threshold) {
                this.data.set(stateKey, 'OPEN');
                this.data.set(reasonKey, tripReason);
                this.data.set(trippedAtKey, String(nowMs));
                this.data.delete(probeLockKey);
                return JSON.stringify({ count, tripped: true, reason: tripReason });
            }

            return JSON.stringify({ count, tripped: false });
        }

        // Circuit Breaker: Reset failure counters on dispatch success
        if (s.includes('CB_RESET_SUCCESS_COUNTERS')) {
            const timeoutsKey = keys[0];
            const authFailuresKey = keys[1];
            const disconnectsKey = keys[2];
            const stateKey = keys[3];

            this.data.delete(timeoutsKey);
            this.data.delete(authFailuresKey);
            this.data.delete(disconnectsKey);
            const state = this.data.get(stateKey) || 'CLOSED';
            return JSON.stringify({ success: true, state });
        }

        // Circuit Breaker: Manual reset
        if (s.includes('CB_MANUAL_RESET')) {
            const stateKey = keys[0];
            const reasonKey = keys[1];
            const trippedAtKey = keys[2];
            const probeLockKey = keys[3];
            const timeoutsKey = keys[4];
            const authFailuresKey = keys[5];
            const disconnectsKey = keys[6];

            this.data.set(stateKey, 'CLOSED');
            this.data.delete(reasonKey);
            this.data.delete(trippedAtKey);
            this.data.delete(probeLockKey);
            this.data.delete(timeoutsKey);
            this.data.delete(authFailuresKey);
            this.data.delete(disconnectsKey);
            return JSON.stringify({ success: true, state: 'CLOSED' });
        }

        // Canonical acquire fenced lock script: if set NX EX then incr(gen) return gen else return 0
        if (s.includes('NX') && s.includes('incr')) {
            const lockKey = keys[0];
            const genKey = keys[1];
            const token = argv[0];
            const ttl = parseInt(argv[1], 10) || 15;
            if (this.data.has(lockKey)) return 0;
            await this.set(lockKey, token, 'NX', 'EX', ttl);
            const currentGen = parseInt(this.data.get(genKey) || '0', 10);
            const nextGen = currentGen + 1;
            this.data.set(genKey, String(nextGen));
            return nextGen;
        }

        // Canonical release lock script: if get(k) == token then del(k) return 1 else return 0
        if (s.includes('del') && s.includes('get')) {
            const key = keys[0];
            const token = argv[0];
            if (this.data.get(key) === token) {
                this.data.delete(key);
                return 1;
            }
            return 0;
        }

        // Canonical renew lock script: if get(k) == token then expire(k, ttl) return 1 else return 0
        if (s.includes('expire') && s.includes('get')) {
            const key = keys[0];
            const token = argv[0];
            const seconds = parseInt(argv[1], 10) || 30;
            if (this.data.get(key) === token) {
                await this.expire(key, seconds);
                return 1;
            }
            return 0;
        }

        return 1;
    }
    async quit() { return 'OK'; }
    async ping() { return 'PONG'; }
}

import { execSync } from "child_process";

const isProduction = process.env.NODE_ENV === 'production';

// Standardize the Redis connection for BullMQ
const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1', // Standardizing on 127.0.0.1 for Mac/Linux stability
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableOfflineQueue: !isProduction, // In production, don't silently queue indefinitely when offline
    connectTimeout: 5000,
    retryStrategy(times) {
        // Stop retrying after 3 attempts in development to prevent log spam and trigger fallback
        if (times > 3 && !isProduction) {
            return null; 
        }
        return Math.min(times * 200, 2000);
    }
};

let internalConnection = null;
let isRedisOnline = false;

// Senior Professional Implementation: Pre-check Redis Availability & Environment Gates
// P0-A: MockRedis must NEVER be selected automatically in production.
// If Redis is unavailable during production startup, expose explicit storage-unavailable condition.
// If Redis disconnects or emits an error in production, do not silently replace the real connection with MockRedis.
if (isProduction) {
    try {
        internalConnection = new Redis(redisOptions);
        internalConnection.isMock = false;

        internalConnection.on('ready', () => {
            isRedisOnline = true;
            console.log('✅ [Redis:Production] Connected and ready');
        });

        internalConnection.on('connect', () => {
            console.log('🔄 [Redis:Production] Connection established');
        });

        internalConnection.on('close', () => {
            isRedisOnline = false;
            console.warn('⚠️ [Redis:Production] Connection closed. isRedisOnline set to false.');
        });

        internalConnection.on('error', (err) => {
            isRedisOnline = false;
            console.error('❌ [Redis:Production] Connection error:', err.message);
            // FAIL-CLOSED: NEVER replace internalConnection with MockRedis in production!
        });
    } catch (err) {
        console.error('❌ [Redis:Production] Failed to initialize Redis client:', err.message);
        isRedisOnline = false;
    }
} else {
    // Non-production environment (development / test)
    let redisExists = false;
    try {
        execSync(`nc -z -w 1 ${redisOptions.host} ${redisOptions.port}`, { stdio: 'ignore' });
        redisExists = true;
    } catch (e) {
        redisExists = false;
    }

    if (!redisExists) {
        console.warn('⚠️  Redis server not detected on port 6379. Pre-emptively starting in MOCK MODE.');
        internalConnection = new MockRedis();
        isRedisOnline = true;
    } else {
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
                    console.warn('❌ Redis Error: Forcing Mock mode fallback for dev/test...');
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
}

/**
 * SENIOR PROFESSIONAL IMPLEMENTATION: Redis Proxy
 * Since ESM default exports are not live bindings, we use a Proxy to ensure
 * that any module importing 'redisConnection' always interacts with the 
 * current active connection (Real or Mock).
 */
const redisProxy = new Proxy({}, {
    get: (target, prop) => {
        if (prop in target) {
            const tVal = target[prop];
            if (typeof tVal === 'function') return tVal.bind(target);
            return tVal;
        }
        // Handle special properties
        if (prop === 'isMock') return internalConnection ? Boolean(internalConnection.isMock) : false;
        if (prop === 'status') return internalConnection ? internalConnection.status : 'disconnected';
        if (prop === 'isOnline') return isRedisOnline;
        
        if (!internalConnection) {
            throw new Error('STORAGE_UNAVAILABLE: Redis connection is not initialized');
        }
        
        const value = internalConnection[prop];
        if (typeof value === 'function') {
            return value.bind(internalConnection);
        }
        return value;
    },
    set: (target, prop, value) => {
        target[prop] = value;
        return true;
    },
    deleteProperty: (target, prop) => {
        delete target[prop];
        return true;
    }
});

export { isRedisOnline };
export const getRedisStatus = () => ({
    isOnline: isRedisOnline,
    isMock: internalConnection ? Boolean(internalConnection.isMock) : false,
    status: internalConnection ? internalConnection.status : 'disconnected'
});

export const safeRedisCall = async (method, ...args) => {
    try {
        if (internalConnection && internalConnection.isMock) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('STORAGE_UNAVAILABLE: MockRedis cannot be accessed in production environment');
            }
            return await internalConnection[method](...args);
        }

        if (!isRedisOnline) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('STORAGE_UNAVAILABLE: Redis connection is currently offline in production environment');
            }
            return null;
        }
        
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis Timeout')), 1000)
        );
        
        return await Promise.race([
            internalConnection[method](...args),
            timeout
        ]);
    } catch (err) {
        if (process.env.NODE_ENV === 'production') {
            throw err;
        }
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
        const hasExplicitConnection = 'connection' in opts;
        const conn = hasExplicitConnection ? opts.connection : internalConnection;
        if (process.env.NODE_ENV === 'production') {
            if (!conn || conn.isMock) {
                throw new Error(`CRITICAL_STORAGE_ERROR: Cannot initialize Queue '${name}' in production: Redis connection is ${conn ? 'MockRedis' : 'absent'}. Real Redis is required.`);
            }
        } else if (conn && conn.isMock) {
            this.name = name;
            mockQueues.set(name, this);
            console.log(`[MockQueue] Registered mock queue: ${name}`);
            return this;
        }
        const bullOpts = hasExplicitConnection ? opts : { connection: internalConnection, ...opts };
        return new BullQueue(name, bullOpts);
    }
    async add(name, data, opts) {
        const jobId = opts?.jobId || `mock-${Date.now()}`;
        if (internalConnection && internalConnection.isMock) {
            const worker = mockWorkers.get(this.name);
            if (worker && worker.processor) {
                const maxAttempts = opts?.attempts || 1;
                const mockJob = {
                    id: jobId,
                    name: name,
                    data: data,
                    progress: 0,
                    attemptsMade: 0,
                    opts: opts || {},
                    log: async (msg) => {
                        console.log(`[MockJob:${jobId}] ${msg}`);
                    },
                    updateProgress: async (prog) => {
                        mockJob.progress = prog;
                    }
                };

                const executeMockAttempt = async () => {
                    try {
                        console.log(`[MockQueue] Processing job ${jobId} (attempt ${mockJob.attemptsMade + 1}/${maxAttempts}) on queue ${this.name}`);
                        const result = await worker.processor(mockJob);
                        worker.emit('completed', mockJob, result);
                    } catch (err) {
                        mockJob.attemptsMade++;
                        console.error(`[MockQueue] Job ${jobId} failed attempt ${mockJob.attemptsMade}/${maxAttempts}:`, err.message);
                        worker.emit('failed', mockJob, err);
                        if (mockJob.attemptsMade < maxAttempts) {
                            const delayMs = opts?.backoff?.delay || 50;
                            setTimeout(executeMockAttempt, delayMs);
                        }
                    }
                };

                setTimeout(executeMockAttempt, 50);
            }
        }
        return { id: jobId, name, data, opts };
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
        const hasExplicitConnection = 'connection' in opts;
        const conn = hasExplicitConnection ? opts.connection : internalConnection;
        if (process.env.NODE_ENV === 'production') {
            if (!conn || conn.isMock) {
                throw new Error(`CRITICAL_STORAGE_ERROR: Cannot initialize Worker '${name}' in production: Redis connection is ${conn ? 'MockRedis' : 'absent'}. Real Redis is required.`);
            }
        } else if (conn && conn.isMock) {
            this.name = name;
            this.processor = processor;
            this._running = true;
            this.closed = false;
            mockWorkers.set(name, this);
            console.log(`[MockWorker] Registered mock worker: ${name}`);
            return this;
        }
        const bullOpts = hasExplicitConnection ? opts : { connection: internalConnection, ...opts };
        return new BullWorker(name, processor, bullOpts);
    }
    isRunning() {
        return this._running !== false && !this.closed;
    }
    isPaused() {
        return false;
    }
    async close() {
        this._running = false;
        this.closed = true;
        return;
    }
}

export { MockRedis, redisOptions };
export default redisProxy;


