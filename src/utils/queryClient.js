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

export const normalizeDashboardStatsParams = (params) => {
    const safeParams = params || {};
    const cleanParams = Object.fromEntries(
        Object.entries(safeParams).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );
    if (cleanParams.userId) {
        delete cleanParams.teamId;
    }
    return cleanParams;
};

export const normalizeProjectListParams = (params) => {
    const safeParams = params || {};
    // Extract base params
    const normalized = {
        page: Number(safeParams.page) || 1,
        limit: Number(safeParams.limit) || 25,
        sortBy: safeParams.sortBy || 'updatedAt',
        sortOrder: Number(safeParams.sortOrder) || -1,
    };
    
    // Spread dynamic filters, stripping undefined, null, empty strings, or empty arrays
    Object.entries(safeParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
            normalized[key] = value;
        }
    });

    return normalized;
};


// Inventory Parameter Normalization
export const normalizeInventoryListParams = (params = {}) => {
    const normalized = {};
    const stringParams = [
        'search', 'sortBy', 'sortOrder', 'category', 'subCategory', 'unitType', 
        'status', 'project', 'projectId', 'block', 'location', 'area', 'contactId', 
        'statusCategory', 'ownerPhone', 'feedbackOutcome', 'feedbackReason', 
        'sizeType', 'followUpFrom', 'followUpTo', 'view'
    ];
    
    stringParams.forEach(key => {
        if (params[key] !== undefined && params[key] !== null && String(params[key]).trim() !== '') {
            normalized[key] = String(params[key]).trim();
        }
    });

    const numParams = ['page', 'limit', 'minSize', 'maxSize', 'sizeMin', 'sizeMax'];
    numParams.forEach(key => {
        if (params[key] !== undefined && params[key] !== null && String(params[key]).trim() !== '') {
            normalized[key] = Number(params[key]);
        }
    });

    Object.keys(params).forEach(key => {
        if (params[key] === false) normalized[key] = false;
        if (params[key] === 0) normalized[key] = 0;
    });

    // Array normalizations (if they are sent as arrays, backend expects CSV or we just join them)
    if (Array.isArray(params.block) && params.block.length > 0) {
        normalized.block = params.block.filter(Boolean).join(',');
    }

    return normalized;
};

// Query Key factories — centralized, prevents key typos
export const normalizeBookingsListParams = (params = {}) => {
    const normalized = {};
    const keys = [
        'contactId', 'status', 'health', 'salesAgent', 'channelPartner', 
        'project', 'dateFrom', 'dateTo', 'minValue', 'maxValue', 'search',
        'limit', 'skip', 'sortBy', 'sortOrder', 'page'
    ];
    
    keys.forEach(key => {
        if (params[key] !== undefined && params[key] !== null && String(params[key]).trim() !== '') {
            normalized[key] = String(params[key]).trim();
        }
    });

    return normalized;
};

export const queryKeys = {
    whatsappTemplates: {
        localDb: () => ['whatsapp-templates', 'local-db'],
    },

    bookings: {
        all: () => ['bookings'],
        lists: () => ['bookings', 'list'],
        list: (params) => ['bookings', 'list', normalizeBookingsListParams(params)],
        details: () => ['bookings', 'detail'],
        detail: (id) => ['bookings', 'detail', id],
        dashboardStats: () => ['bookings', 'dashboard-stats']
    },
    // Leads
    leads: (params) => ['leads', params],
    lead: (id) => ['lead', id],
    leadScores: () => ['lead-scores'],
    // Contacts
    contacts: (params) => ['contacts', params],
    contact: (id) => ['contact', id],
    // Lookups — long-lived, rarely changes
    lookups: {
        all: () => ['lookups'],
        types: (typesArray) => ['lookups', 'types', { types: [...typesArray].sort() }],
        parent: (parentId) => ['lookups', 'parent', parentId]
    },
    lookupByCategory: (category) => ['lookups', category],
    // Users/Teams
    users: () => ['users'],
    teams: () => ['teams'],
    roles: () => ['roles'],
    // Stats
    pipelineStats: (type) => ['pipeline-stats', type],
    dashboard: {
        stats: (params) => ['dashboard', 'stats', normalizeDashboardStatsParams(params)],
        aiIntelligence: () => ['dashboard', 'ai-intelligence'],
    },
    // Activities
    activities: {
        all: () => ['activities'],
        list: (filters) => ['activities', 'list', filters],
        unified: (entityType, entityId) => ['activities', 'unified', entityType, entityId]
    },
    // Deals
    deals: {
        all: () => ['deals'],
        list: (params) => ['deals', params],
        detail: (id) => ['deal', id],
    },
    // Companies
    companies: {
        all: () => ['companies'],
        list: (params) => ['companies', params],
        detail: (id) => ['company', id],
    },
    companyGroups: {
        all: () => ['company-groups'],
    },
    // Projects
    projects: {
        all: () => ['projects'],
        list: (params) => ['projects', 'list', normalizeProjectListParams(params)],
        detail: (id) => ['projects', 'detail', id],
    },
    // Inventory
    inventory: {
        all: () => ['inventory'],
        lists: () => ['inventory', 'list'],
        list: (params) => ['inventory', 'list', normalizeInventoryListParams(params)],
        details: () => ['inventory', 'detail'],
        detail: (id) => ['inventory', 'detail', id],
        matches: (inventoryId) => ['inventory', 'match', { inventoryId }],
        blocks: (project) => ['inventory', 'blocks', project ? { project } : {}],
        suggestedOwners: (id) => ['inventory', 'suggested-owners', id],
    },
};

// Stale time overrides for specific data types
export const STALE_TIMES = {
    STATIC: 10 * 60 * 1000,     // 10 min — lookups, roles
    SEMI_STATIC: 2 * 60 * 1000, // 2 min — users, teams
    LIVE: 30 * 1000,             // 30s — leads, contacts
    REALTIME: 10 * 1000,         // 10s — dashboard stats
};
