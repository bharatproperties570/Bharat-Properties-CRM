import LookupService from '../services/LookupService.js';

/**
 * Enterprise-Grade Lookup Resolver
 * Delegated to LookupService (Sprint 6.1 centralized architecture)
 */
export const resolveLookup = async (type, value, parent_lookup_id = null) => {
    return await LookupService.resolve(type, value, {
        parentId: parent_lookup_id,
        checkAliases: true,
        createIfMissing: true
    });
};

/**
 * Resolves a full address object hierarchically
 * Country -> State -> City -> Location/Area
 */
export const resolveHierarchicalAddress = async (addr) => {
    return await LookupService.resolveHierarchicalAddress(addr);
};

export default {
    resolveLookup,
    resolveHierarchicalAddress
};
