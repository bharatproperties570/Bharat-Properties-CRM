/**
 * Enterprise CRM Data Hooks
 * - Unified data fetching with React Query
 * - Instant cache hits on page revisit
 * - Background refetch while showing stale data
 * - Prefetch next page automatically
 */
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from './api';
import { queryKeys, STALE_TIMES } from './queryClient';

// ─── LOOKUPS (Mostly static, 10 min cache) ─────────────────────────────────
export function useLookups(category) {
    return useQuery({
        queryKey: category ? queryKeys.lookupByCategory(category) : queryKeys.lookups(),
        queryFn: async () => {
            const params = category ? { category } : {};
            const res = await api.get('lookups', { params });
            return res.data?.data || res.data || [];
        },
        staleTime: STALE_TIMES.STATIC,
        gcTime: 15 * 60 * 1000,
        placeholderData: (prev) => prev, // Keep old data while fetching
    });
}

// ─── USERS (2 min cache) ────────────────────────────────────────────────────
export function useUsers() {
    return useQuery({
        queryKey: queryKeys.users(),
        queryFn: async () => {
            const res = await api.get('users');
            return res.data?.data || res.data || [];
        },
        staleTime: STALE_TIMES.SEMI_STATIC,
        gcTime: 5 * 60 * 1000,
        placeholderData: (prev) => prev,
    });
}

// ─── TEAMS (2 min cache) ────────────────────────────────────────────────────
export function useTeams() {
    return useQuery({
        queryKey: queryKeys.teams(),
        queryFn: async () => {
            const res = await api.get('teams');
            return res.data?.data || res.data || [];
        },
        staleTime: STALE_TIMES.SEMI_STATIC,
        gcTime: 5 * 60 * 1000,
        placeholderData: (prev) => prev,
    });
}

// ─── LEADS (30s cache, background refresh) ──────────────────────────────────
export function useLeads(params) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: queryKeys.leads(params),
        queryFn: async () => {
            const res = await api.get('leads', { params });
            return res.data;
        },
        staleTime: STALE_TIMES.LIVE,
        gcTime: 2 * 60 * 1000,
        placeholderData: (prev) => prev, // Show old data instantly while loading new
        keepPreviousData: true,
    });

    // Prefetch next page in background
    const prefetchNextPage = async (nextPage) => {
        const nextParams = { ...params, page: nextPage };
        queryClient.prefetchQuery({
            queryKey: queryKeys.leads(nextParams),
            queryFn: async () => {
                const res = await api.get('leads', { params: nextParams });
                return res.data;
            },
            staleTime: STALE_TIMES.LIVE,
        });
    };

    return { ...query, prefetchNextPage };
}

// ─── CONTACTS (30s cache) ───────────────────────────────────────────────────
export function useContacts(params) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: queryKeys.contacts(params),
        queryFn: async () => {
            const res = await api.get('contacts', { params });
            return res.data;
        },
        staleTime: STALE_TIMES.LIVE,
        gcTime: 2 * 60 * 1000,
        placeholderData: (prev) => prev,
        keepPreviousData: true,
    });

    const prefetchNextPage = async (nextPage) => {
        const nextParams = { ...params, page: nextPage };
        queryClient.prefetchQuery({
            queryKey: queryKeys.contacts(nextParams),
            queryFn: async () => {
                const res = await api.get('contacts', { params: nextParams });
                return res.data;
            },
            staleTime: STALE_TIMES.LIVE,
        });
    };

    return { ...query, prefetchNextPage };
}

// ─── SINGLE LEAD ────────────────────────────────────────────────────────────
export function useLead(id) {
    return useQuery({
        queryKey: queryKeys.lead(id),
        queryFn: async () => {
            const res = await api.get(`leads/${id}`);
            return res.data?.data || res.data;
        },
        enabled: !!id,
        staleTime: STALE_TIMES.LIVE,
    });
}

// ─── PIPELINE STATS ─────────────────────────────────────────────────────────
export function usePipelineStats(entityType = 'lead') {
    return useQuery({
        queryKey: queryKeys.pipelineStats(entityType),
        queryFn: async () => {
            const res = await api.get(`stage-engine/${entityType}s/scores`);
            return res.data;
        },
        staleTime: STALE_TIMES.REALTIME,
        gcTime: 60 * 1000,
        placeholderData: (prev) => prev,
    });
}

// ─── INVALIDATE ALL LEADS CACHE (call after add/update/delete) ──────────────
export function useInvalidateLeads() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
    };
}

export function useInvalidateContacts() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
    };
}

// ─── GENERIC CACHED API CALL ─────────────────────────────────────────────────
export function useCachedQuery(key, url, params = {}, options = {}) {
    return useQuery({
        queryKey: Array.isArray(key) ? key : [key, params],
        queryFn: async () => {
            const res = await api.get(url, { params });
            return res.data;
        },
        staleTime: STALE_TIMES.LIVE,
        placeholderData: (prev) => prev,
        ...options,
    });
}
