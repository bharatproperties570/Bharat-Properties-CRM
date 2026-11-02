/**
 * Bharat Properties CRM — Authority Portal Integration Package
 * Phase 4.4.4
 *
 * Provides complete source-specific adapters, deterministic parsers,
 * fail-closed approval gating, response guarding, distributed locking,
 * shared quota reservation, circuit-breaker control, and exact inventory matching.
 */

export * from './authorityPortalDefinitions.js';
export * from './authorityPortalApprovalGate.js';
export * from './authorityPortalSafety.js';
export * from './authorityPortalResponseGuard.js';
export * from './authorityPortalResultSanitizer.js';
export * from './authorityPortalSearchMapper.js';
export * from './authorityPortalRuntime.js';

export * from './parsers/portalParserRegistry.js';
export * from './parsers/hsvpPortalParser.js';
export * from './parsers/gmadaPortalParser.js';
export * from './parsers/chdPortalParser.js';

export * from './adapters/portalAdapterRegistry.js';
export * from './adapters/hsvpPortalAdapter.js';
export * from './adapters/gmadaPortalAdapter.js';
export * from './adapters/chdPortalAdapter.js';

export * from './infrastructure/portalHttpTransport.js';
export * from './infrastructure/redisPortalDistributedLock.js';
export * from './infrastructure/redisPortalQuotaProvider.js';
export * from './infrastructure/durablePortalCircuitBreaker.js';
export * from './infrastructure/portalAuditSink.js';

export * from './portalInventoryMatcher.js';
