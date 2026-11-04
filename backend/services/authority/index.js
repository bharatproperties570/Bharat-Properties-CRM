/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — AUTHORITY VERIFICATION SERVICE BARREL
 * ============================================================================
 * 
 *  Central export point for all authority services, models, adapters, and policies.
 * 
 *  @module services/authority
 *  @version 3.0.0-phase3a
 */

export { default as BaseFixtureAdapter } from './BaseFixtureAdapter.js';
export { default as HsvpFixtureAdapter } from './HsvpFixtureAdapter.js';
export { default as ChandigarhFixtureAdapter } from './ChandigarhFixtureAdapter.js';
export { default as GmadaFixtureAdapter } from './GmadaFixtureAdapter.js';

export {
    getAdapter,
    getAllAdapters,
    isKnownAuthority,
    executeFixturePipeline,
    executeLiveVerification
} from './adapterRegistry.js';

export * from './authorityFieldDictionary.js';
export * from './authorityNormalizer.js';
export * from './sourcePolicy.js';

export {
    HSVP_SYNTHETIC,
    CHD_SYNTHETIC,
    GMADA_SYNTHETIC,
    ALL_SYNTHETIC_FIXTURES
} from './fixtures/syntheticPhase3AFixtures.js';

export { AuthorityBulkProcessor } from './AuthorityBulkProcessor.js';
export {
    AuthorityRefreshScheduler,
    authorityScheduler,
    initAuthorityScheduler,
    stopAuthorityScheduler
} from './AuthorityRefreshScheduler.js';
