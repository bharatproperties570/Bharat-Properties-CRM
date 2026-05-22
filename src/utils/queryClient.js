/**
 * Enterprise React Query Client
 * - stale-while-revalidate strategy
 * - Smart TTLs per data type
 * - Global error handling
 * - DevTools in development
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Show cached data instantly, fetch in background
            staleTime: 30 * 1000,        // 30s — consider data fresh
            gcTime: 5 * 60 * 1000,       // 5 min — keep in memory
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
            refetchOnWindowFocus: false,  // Don't refetch on tab switch
            refetchOnMount: 'always',     // Always check if stale on mount
        },
        mutations: {
            retry: 1,
        }
    }
});

// Query Key factories — centralized, prevents key typos
export const queryKeys = {
    // Leads
    leads: (params) => ['leads', params],
    lead: (id) => ['lead', id],
    leadScores: () => ['lead-scores'],
    // Contacts
    contacts: (params) => ['contacts', params],
    contact: (id) => ['contact', id],
    // Lookups — long-lived, rarely changes
    lookups: () => ['lookups'],
    lookupByCategory: (category) => ['lookups', category],
    // Users/Teams
    users: () => ['users'],
    teams: () => ['teams'],
    roles: () => ['roles'],
    // Stats
    pipelineStats: (type) => ['pipeline-stats', type],
    dashboard: () => ['dashboard'],
    // Activities
    activities: (entityId) => ['activities', entityId],
    // Inventory
    inventory: (params) => ['inventory', params],
};

// Stale time overrides for specific data types
export const STALE_TIMES = {
    STATIC: 10 * 60 * 1000,     // 10 min — lookups, roles
    SEMI_STATIC: 2 * 60 * 1000, // 2 min — users, teams
    LIVE: 30 * 1000,             // 30s — leads, contacts
    REALTIME: 10 * 1000,         // 10s — dashboard stats
};
