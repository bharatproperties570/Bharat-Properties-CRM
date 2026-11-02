/**
 * Portal Runtime Factory
 *
 * Injects genuine application Redis client and durable infrastructure providers
 * into the Authority Portal Runtime.
 * Strictly forbids MockRedis and disconnected Redis in production.
 */

import redisProxy from '../../../src/config/redis.js';
import { createAuthorityPortalRuntime } from './authorityPortalRuntime.js';
import { RedisPortalDistributedLock } from './infrastructure/redisPortalDistributedLock.js';
import { RedisPortalQuotaProvider } from './infrastructure/redisPortalQuotaProvider.js';
import { DurablePortalCircuitBreaker } from './infrastructure/durablePortalCircuitBreaker.js';
import { PortalAuditSink } from './infrastructure/portalAuditSink.js';
import { portalHttpTransport } from './infrastructure/portalHttpTransport.js';
import { PORTAL_PARSERS } from './parsers/portalParserRegistry.js';

export function getApplicationRedisClient() {
    return redisProxy;
}

/**
 * Creates an Authority Portal Runtime wired with application Redis and durable providers.
 * @param {object} [options={}]
 * @returns {object} Authority Portal Runtime
 */
export function createConfiguredPortalRuntime(options = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    const requireRealRedis = Boolean(options.requireRealRedis || isProduction);
    const redisClient = options.redisClient !== undefined ? options.redisClient : getApplicationRedisClient();

    // P0.3: In production, missing/unready/mock Redis must throw before transport is called
    if (requireRealRedis) {
        if (!redisClient || redisClient.isMock === true) {
            const err = new Error('REDIS_UNAVAILABLE_FOR_PORTAL: Production authority portal egress requires a genuine, non-mock Redis instance.');
            err.code = 'REDIS_UNAVAILABLE_FOR_PORTAL';
            throw err;
        }
        if (redisClient.status !== 'ready' && typeof redisClient.ping !== 'function') {
            const err = new Error('REDIS_UNAVAILABLE_FOR_PORTAL: Configured Redis client is not in ready state.');
            err.code = 'REDIS_UNAVAILABLE_FOR_PORTAL';
            throw err;
        }
    }

    const lockProvider = options.lockProvider || new RedisPortalDistributedLock(redisClient, options);
    const quotaProvider = options.quotaProvider || new RedisPortalQuotaProvider(redisClient, options);
    const circuitBreakerStore = options.circuitBreakerStore || new DurablePortalCircuitBreaker(options);
    const auditSink = options.auditSink || new PortalAuditSink(undefined, options);
    const transport = options.transport || portalHttpTransport;
    const parserRegistry = options.parserRegistry || PORTAL_PARSERS;

    return createAuthorityPortalRuntime({
        lockProvider,
        quotaProvider,
        circuitBreakerStore,
        transport,
        parserRegistry,
        auditSink,
        gateConfig: options.gateConfig || {
            enabled: true,
            readOnly: true,
            requireWrittenPermission: true,
            requireCommercialUsePermission: true,
            requireApprovedFieldScope: true,
            requireApprovedRatePolicy: true,
            maxConcurrentRequests: 1
        }
    });
}

export default createConfiguredPortalRuntime;
