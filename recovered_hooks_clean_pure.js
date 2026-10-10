export const useAIIntelligence = (options = {}) => {
    return useQuery({
        queryKey: queryKeys.dashboard.aiIntelligence(),
        queryFn: async () => {
            const res = await api.get('/dashboard/ai-intelligence');
            return res.data?.data || res.data;
        },
        staleTime: STALE_TIMES.STATIC, // 10 minutes to protect heavy DB aggregates
        refetchOnMount: true,
        ...options
    });
}

export function useActiveUsers() {
    const { data: users = [], ...rest } = useUsers();
    const activeUsers = useMemo(() => 
        users.filter(u => u.status === 'active' || u.isActive), 
    [users]);
    return { ...rest, data: activeUsers };
}

export function useActivities(filters = {}) {
    return useQuery({
        queryKey: queryKeys.activities.list(filters),
        queryFn: async () => {
            const res = await activitiesAPI.getAll(filters);
            return res.success ? res.data : [];
        },
        staleTime: STALE_TIMES.LIVE
    });
}

export function useAddActivityMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (activityData) => {
            const normalizedData = { ...activityData };

            if (!normalizedData.relatedTo) normalizedData.relatedTo = [];
            if (activityData.contactName && normalizedData.relatedTo.length === 0) {
                normalizedData.relatedTo.push({
                    id: activityData.contactPhone || activityData.mobile || 'Unknown',
                    name: activityData.contactName,
                    model: activityData.entityType || 'Lead'
                });
            }

            if (!normalizedData.participants) normalizedData.participants = [];
            const mobileNum = activityData.mobile || activityData.contactPhone || activityData.phone;
            if (mobileNum && normalizedData.participants.length === 0) {
                normalizedData.participants.push({
                    name: activityData.contactName || 'Participant',
                    mobile: mobileNum
                });
            }

            if (!normalizedData.entityId && normalizedData.relatedTo.length > 0) {
                normalizedData.entityId = normalizedData.relatedTo[0].id;
                normalizedData.entityType = normalizedData.relatedTo[0].model || normalizedData.relatedTo[0].type;
            }

            if (!normalizedData.dueDate) {
                normalizedData.dueDate = normalizedData.scheduledDate || new Date();
            }

            if (!normalizedData.details) normalizedData.details = {};
            if (!normalizedData.details.platform) normalizedData.details.platform = 'WebCRM';
            if (!normalizedData.details.source) normalizedData.details.source = 'ManualForm';

            const response = await activitiesAPI.create(normalizedData);
            if (!response.success) {
                console.error('[Activity Hooks] backend returned success: false', response);
                return undefined;
            }
            
            if (response.transition?.stageChanged) {
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#3b82f6', '#f59e0b']
                });
                window.dispatchEvent(new CustomEvent('STAGE_UPDATED', { detail: { newStage: response.transition.newStage } }));
            }
            
            return response.data;
        },
        onSuccess: (data) => {
            if (data) {
                queryClient.invalidateQueries({ queryKey: queryKeys.activities.all() });
            }
        }
    });
}

export const useAddCompanyGroupMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/company-groups', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.companyGroups.all() });
        }
    });
}

export const useAddCompanyMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/companies', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.all() });
        }
    });
}

export const useAddDealMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/deals', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.deals.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.pipelineStats() });
        }
    });
}

export function useAddInventoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/inventory', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.blocks() });
            window.dispatchEvent(new Event('inventory-updated'));
        }
    });
}

export function useAddLeadMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const finalLeadPayload = normalizeLeadRefs(payload);
            const res = await api.post('/leads', finalLeadPayload);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
        }
    });
}

export function useAddProjectMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (projectData) => {
            const res = await api.post('/projects', projectData);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
        }
    });
}

export function useAddUserMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (userData) => {
            try {
                // api.js usersAPI.create uses apiRequest which returns the response body
                const response = await api.post('users', userData);
                const result = response.data;
                if (result.success) {
                    return { success: true, data: result.data };
                }
                return result; // in case the backend returns 200 but success: false
            } catch (err) {
                // Emulate the legacy catch block which returned { success: false, error: msg }
                return { success: false, error: err.response?.data?.message || err.message };
            }
        },
        onSuccess: (result) => {
            if (result && result.success) {
                queryClient.invalidateQueries({ queryKey: queryKeys.users() });
            }
        }
    });
}

export const useAssignCompanyGroupMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/company-groups/bulk-assign', payload);
            return res.data;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.all() });
            if (variables.companyIds) {
                variables.companyIds.forEach(id => {
                    queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(id) });
                });
            }
        }
    });
}

export function useBooking(id, options = {}) {
    return useQuery({
        queryKey: queryKeys.bookings.detail(id),
        queryFn: async () => {
            const res = await api.get(`/bookings/${id}`);
            return res.data.data; // bookingObj
        },
        staleTime: STALE_TIMES.LIVE,
        ...options,
        enabled: !!id && (options.enabled ?? true)
    });
}

export function useBookingDashboardStats(options = {}) {
    return useQuery({
        queryKey: queryKeys.bookings.dashboardStats(),
        queryFn: async () => {
            const res = await api.get('/bookings/dashboard/stats');
            return res.data.data;
         },
         staleTime: STALE_TIMES.REALTIME,
        ...options
     });
 }

export function useBookings(params = {}, options = {}) {
    return useQuery({
        queryKey: queryKeys.bookings.list(params),
        queryFn: async () => {
            const normalizedParams = queryKeys.bookings.list(params)[2];
            const queryParams = new URLSearchParams(normalizedParams);
            const res = await api.get(`/bookings?${queryParams.toString()}`);
            return res.data; // { success, count, data }
        },
        staleTime: STALE_TIMES.LIVE,
        ...options
    });
}

export function useBulkAddInventoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/inventory/bulk-add', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.blocks() });
            window.dispatchEvent(new Event('inventory-updated'));
        }
    });
}

export const useBulkDeleteCompaniesMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids }) => {
            const res = await api.post('/companies/bulk-delete', { ids });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.all() });
        }
    });
}

export function useBulkDeleteContactsMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids) => {
            const res = await api.delete('contacts/bulk', { data: { ids } });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
        }
    });
}

export const useBulkDeleteDealsMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids }) => {
            const res = await api.post('/deals/bulk-delete', { ids });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.deals.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.pipelineStats() });
        }
    });
}

export function useBulkDeleteInventoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/inventory/bulk-delete', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.details() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.blocks() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.matches() });
            window.dispatchEvent(new Event('inventory-updated'));
        }
    });
}

export function useBulkDeleteLeadsMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids }) => {
            const res = await api.post('/leads/bulk-delete', { ids });
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
        }
    });
}

export function useBulkUpdateInventoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/inventory/bulk-update', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.details() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.blocks() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.matches() });
            window.dispatchEvent(new Event('inventory-updated'));
        }
    });
}

export function useBulkUpdateInventoryOwnersMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/inventory/bulk-update-owners', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.details() });
            window.dispatchEvent(new Event('inventory-updated'));
        }
    });
}

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

export const useCompanies = (params, options) => {
    return useQuery({
        queryKey: queryKeys.companies.list(params),
        queryFn: async () => {
            // Strip undefined/empty values from params
            const cleanParams = Object.fromEntries(
                Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
            );
            const res = await api.get('/companies', { params: cleanParams });
            return res.data;
        },
        staleTime: STALE_TIMES.LIVE,
        ...options,
    });
}

export const useCompany = (id, options) => {
    return useQuery({
        queryKey: queryKeys.companies.detail(id),
        queryFn: async () => {
            const res = await api.get(`companies/${id}`);
            return res.data?.data || res.data;
        },
        enabled: !!id,
        staleTime: STALE_TIMES.LIVE,
        ...options,
    });
}

export const useCompanyGroups = (options) => {
    return useQuery({
        queryKey: queryKeys.companyGroups.all(),
        queryFn: async () => {
            const res = await api.get('/company-groups');
            return res.data?.data || res.data;
        },
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

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

export function useCreateBookingMutation() {
     const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post('/bookings', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.dashboardStats() });
            window.dispatchEvent(new Event('booking-updated'));
        }
    });
 }

export function useCreateBookingPaymentMutation(bookingId) {
     const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post(`/bookings/${bookingId}/payments`, payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.dashboardStats() });
            window.dispatchEvent(new Event('booking-updated'));
        }
    });
 }

export const useDashboardStats = (rawParams = {}, options = {}) => {
    const canonicalParams = normalizeDashboardStatsParams(rawParams);
    return useQuery({
        queryKey: queryKeys.dashboard.stats(canonicalParams),
        queryFn: async () => {
            const res = await api.get('/dashboard/stats', { params: canonicalParams });
            return res.data?.data || res.data;
        },
        staleTime: STALE_TIMES.SEMI_STATIC, // 2 minutes
        refetchOnMount: true, // Respect staleTime instead of 'always' fetching
        ...options
    });
}

export const useDeal = (id) => {
    return useQuery({
        queryKey: queryKeys.deals.detail(id),
        queryFn: async () => {
            const res = await api.get(`deals/${id}?unified=true`);
            // Preserve DealDetailPage expected envelope
            return {
                data: res.data.data,
                matchingLeads: res.data.matchingLeads,
                liveScore: res.data.liveScore
            };
        },
        enabled: !!id,
        staleTime: 5 * 60 * 1000
    });
}

export const useDeals = (params = {}, options = {}) => {
    return useQuery({
        queryKey: queryKeys.deals.list(params),
        queryFn: async () => { ... },
        staleTime: 5 * 60 * 1000,
        keepPreviousData: true,
        ...options   // ← options spread enables { enabled: !!leadId } etc.
    });
};
```

### Worktree State:


## 5. Files and Code

### Edited Files (this session / Phase 10.3):

| File | Change | Why |
|---|---|---|
| `src/pages/Deals/views/DealIntakePage.jsx` | Removed `dealData`/`setDealData` useState + useEffect mirror; added `const dealsList = dealsPayload?.records \|\| []`; renamed `dealData` param → `quickDealData` in handleQuickDealCreate | Gate 120.65C R1 — eliminate duplicate server-state |
| `src/pages/Deals/DealDetailPage.jsx` | Removed `deal`, `matchingLeads`, `liveScoreData` useState caches; added `optimisticStage` with auto-clear effect; restored bounded inventory fetch | Gate 120.65C R1 — eliminate duplicate server-state |
| `src/components/AddDealModal.jsx` | Replaced `fetchExistingDeals` + raw api.get with `useDeals({inventoryId, limit, stage}, {enabled: !!formData.inventoryId})`; removed `existingDeals`/`isCheckingDuplicate` useState | Gate 120.65C R6 — eliminate forbidden CRUD consumer |
| `src/components/AddBookingModal.jsx` | Replaced `useEffect + api.get('/deals/:id')` with `useDeal(isOpen && dealId ? dealId : null)` + effect on `dealPayload?.data` | Gate 120.65C R6 — eliminate forbidden CRUD consumer |
| `src/utils/queryClient.js` | Added `deals: { all, list, detail }` to `queryKeys` object | Gate 120.65C R5 — register canonical Deal query keys |
| `src/utils/crmHooks.js` | Added `useDeals`, `useDeal`, `useAddDealMutation`, `useUpdateDealMutation`, `useDeleteDealMutation`, `useBulkDeleteDealsMutation` | Gate 120.65A/B — canonical Deals TanStack layer |
| `src/pages/Deals/DealsPageV2.jsx` | Removed local `deals`/`totalRecords`/`categoryStats` state; migrated to `useDeals`; removed optimistic list splicing | Gate 120.65A/B |
| `src/components/EngagedDealsCard.jsx` | Replaced raw `api.get` with `useDeals({ leadId, limit: 10 }, { enabled: !!leadId })` | Gate 120.65A/B |
| `src/components/AddQuoteModal.jsx` | Replaced `api.put` with `useUpdateDealMutation({ isPartial: true })` | Gate 120.65A/B |
| `src/components/DealDetail/DealBuiltupDetails.jsx` | Replaced `api.put` with `useUpdateDealMutation({ isPartial: true }

export function useDeleteActivityMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const response = await activitiesAPI.delete(id);
            if (!response.success) return undefined;
            return true;
        },
        onSuccess: (data) => {
            if (data) {
                queryClient.invalidateQueries({ queryKey: queryKeys.activities.all() });
            }
        }
    });
}


// ─── LEADS DOMAIN MUTATIONS ────────────────────────────────────────────────

// Normalizes references to IDs only to prevent 500/400 backend schema validation errors
const normalizeLeadRefs = (obj, parentKey = null) => {
    if (!obj || typeof obj !== 'object') return obj;
    const result = Array.isArray(obj) ? [...obj] : { ...obj };

    // Fields that should REMAIN as objects (not converted to IDs)
    const embeddedFields = ["phones", "emails", "personalAddress", "correspondenceAddress", "educations", "loans", "socialMedia", "incomes", "documents"];

    if (Array.isArray(result)) {
        if (embeddedFields.includes(parentKey)) {
            return result.map(item => normalizeLeadRefs(item));
        }
        queryKey: queryKeys.deals.list(params),
        queryFn: async () => {
            const res = await api.get('deals', { params });
            // Preserve DealsPageV2 expected envelope
            return {
                records: res.data.records || [],
                totalCount: res.data.totalCount || 0,
                categoryStats: res.data.categoryStats || []
            };
        },
        staleTime: 5 * 60 * 1000,
        keepPreviousData: true,
        ...options
    });
}

export function useDeleteBookingReceiptMutation(bookingId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ paymentId }) => {
            const res = await api.delete(`/bookings/${bookingId}/payments/${paymentId}/receipt`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
        }
    });
}

// ── WHATSAPP TEMPLATES (SERVER STATE) ──





const mergeWithDefaults = (overlayList) => {
    if (!overlayList || !Array.isArray(overlayList) || overlayList.length === 0) {
        return defaultTemplates;
    }
    const merged = [...defaultTemplates];
    overlayList.forEach(tpl => {
        const idx = merged.findIndex(t => String(t.id) === String(tpl.id));
        if (idx >= 0) merged[idx] = tpl;
        else merged.push(tpl);
    });
    return merged;
}

export const useDeleteCompanyGroupMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const res = await api.delete(`/company-groups/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.companyGroups.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.all() }); // Backend $pulls groups from companies
        }
    });
}

export const useDeleteCompanyMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const res = await api.delete(`companies/${id}`);
            return res.data;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(variables) });
        }
    });
}

export function useDeleteContactMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const res = await api.delete(`contacts/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
        }
    });
}

export const useDeleteDealMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const res = await api.delete(`/deals/${id}`);
            return res.data;
        },
        onSuccess: (data, id) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.deals.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.pipelineStats() });
        }
    });
}

export function useDeleteInventoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const res = await api.delete(`/inventory/${id}`);
            return res.data;
        },
        onSuccess: (resData, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.detail(variables) });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.blocks() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.matches({ inventoryId: variables }) });
            window.dispatchEvent(new Event('inventory-updated'));
        }
    });
}

export function useDeleteLeadMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, deleteContact = false }) => {
            let url = \`/leads/\${id}\`;
            if (deleteContact) url += '?deleteContact=true';
            const res = await api.delete(url);
            return res;
        },
        onSuccess: (res, variables) => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['lead', variables.id] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
        }
    });
}

export function useDeleteProjectMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const res = await api.delete(`/projects/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
        }
    });
}

export function useDeleteUserMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            try {
                const response = await api.delete(`users/${id}`);
                const result = response.data;
                if (result.success) {
                    return { success: true };
                }
                return result;
            } catch (err) {
                return { success: false, error: err.response?.data?.message || err.message };
            }
        },
        onSuccess: (result) => {
            if (result && result.success) {
                queryClient.invalidateQueries({ queryKey: queryKeys.users() });
            }
        }
    });
}

export function useInvalidateContacts() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
    };
}

export function useInvalidateLeads() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
    };
}

export function useInventories(params = {}, options = {}) {
    return useQuery({
        queryKey: queryKeys.inventory.list(params),
        queryFn: async () => {
            const normalizedParams = queryKeys.inventory.list(params)[2];
            const res = await api.get('/inventory', { params: normalizedParams });
            return res.data;
        },
        staleTime: STALE_TIMES.LIVE,
        ...options
    });
}

export function useInventory(id, options = {}) {
    return useQuery({
        queryKey: queryKeys.inventory.detail(id),
        queryFn: async () => {
            const res = await api.get(`/inventory/${id}`);
            return res.data.data || res.data;
        },
        staleTime: STALE_TIMES.LIVE,
        ...options,
        enabled: !!id && (options.enabled ?? true)
    });
}

export function useInventoryBlocks(project, options = {}) {
    return useQuery({
        queryKey: queryKeys.inventory.blocks(project),
        queryFn: async () => {
            const params = project ? { project } : {};
            const res = await api.get('/inventory/blocks', { params });
            return res.data.data || res.data;
        },
        staleTime: STALE_TIMES.STATIC,
        ...options
    });
}

export function useInventoryMatches(inventoryId, options = {}) {
    return useQuery({
        queryKey: queryKeys.inventory.matches(inventoryId),
        queryFn: async () => {
            const res = await api.get('/inventory/match', { params: { inventoryId } });
            return res.data;
        },
        staleTime: STALE_TIMES.LIVE,
        ...options,
        enabled: !!inventoryId && (options.enabled ?? true)
    });
}

export function useInventorySuggestedOwners(id, options = {}) {
    return useQuery({
        queryKey: queryKeys.inventory.suggestedOwners(id),
        queryFn: async () => {
            const res = await api.get(`/inventory/${id}/suggested-owners`);
            return res.data.data || res.data;
        },
        staleTime: STALE_TIMES.LIVE,
        ...options,
        enabled: !!id && (options.enabled ?? true)
    });
}

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

export function useProject(id, options = {}) {
    return useQuery({
        queryKey: queryKeys.projects.detail(id),
        queryFn: async () => {
            const res = await api.get(`/projects/${id}`);
            return res.data;
        },
        enabled: !!id,
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

export function useProjects(params = {}, options = {}) {
    return useQuery({
        queryKey: queryKeys.projects.list(params),
        queryFn: async () => {
            const res = await api.get('/projects', { params: queryKeys.projects.list(params)[2] });
            return res.data; // Return complete envelope { success, data, totalCount, etc. }
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        placeholderData: (prev) => prev,
        ...options,
    });
}

export function useSavePaymentScheduleMutation(bookingId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.post(`/bookings/${bookingId}/payment-schedule`, payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
        }
    });
}

export function useSaveWhatsAppTemplatesMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (templateList) => {
            const res = await systemSettingsAPI.upsert('crm_whatsapp_templates', { value: templateList });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.whatsappTemplates.localDb() });
        }
    });
}

export function useSubmitWhatsAppTemplateMutation() {
    return useMutation({
        mutationFn: async (savedData) => {
            const res = await whatsappService.submitTemplateToMeta(savedData);
            return res; // returns { success, id }
        }
    });
}

export function useSyncWhatsAppTemplatesCommand() {
    return useMutation({
        mutationFn: async () => {
            const res = await whatsappService.syncTemplatesFromMeta();
            return res; // returns { success, data }
        }
    });
}

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

export function useToggleUserStatusMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, status, reason, duration, customDate }) => {
            try {
                const response = await api.post(`users/${id}/status`, { status, reason, duration, customDate });
                const result = response.data;
                if (result.success) {
                    return { success: true, data: result.data };
                }
                return result;
            } catch (err) {
                return { success: false, error: err.response?.data?.message || err.message };
            }
        },
        onSuccess: (result) => {
            if (result && result.success) {
                queryClient.invalidateQueries({ queryKey: queryKeys.users() });
            }
        }
    });
}


// ─── ACTIVITY DOMAIN (Replaces ActivityContext) ─────────────────────────────
import { activitiesAPI }

export function useUnifiedActivities(entityType, entityId) {
    return useQuery({
        queryKey: queryKeys.activities.unified(entityType, entityId),
        queryFn: async () => {
            const res = await activitiesAPI.getUnified(entityType, entityId);
            return res.success ? res.data : [];
        },
        enabled: !!entityType && !!entityId,
        staleTime: STALE_TIMES.LIVE,
    });
}
```
*Note:* The component `UnifiedActivitySection` currently uses a `Promise.all` mapping to fetch multiple related entities. The contract migration will replace this with TanStack's `useQueries` or a unified query wrapper inside the component to preserve existing behavior.

### 5. DESIGN ADD ACTIVITY MUTATION CONTRACT
**Normalization Pipeline:**
1. **Consumer input:** `activityData` object.
2. **Clone:** `const normalizedData = { ...activityData };`
3. **`relatedTo` normalization:** Instantiated to `[]` if missing. If `contactName` exists but `relatedTo` is empty, `{id: mobile||'Unknown', name: contactName, model: entityType||'Lead'}` is pushed.
4. **`participants` normalization:** Instantiated to `[]`. If `mobile`, `contactPhone`, or `phone` exist and participants is empty, `{name: contactName||'Participant', mobile: mobileNum}` is pushed.
5. **Entity identification:** If `!entityId` and `relatedTo.length > 0`, assigns `entityId = relatedTo[0].id` and `entityType = relatedTo[0].model || type`.
6. **`dueDate` normalization:** Falls back to `scheduledDate` or `new Date()`.
7. **Platform injection:** Asserts `details.platform = 'WebCRM'` and `details.source = 'ManualForm'`.
8. **API payload execution:** `activitiesAPI.create(normalizedData)`.
9. **Side effects:** Conditional execution of `confetti()` and `window.dispatchEvent('STAGE_UPDATED')`.

### 6. ADD ACTIVITY RETURN CONTRACT

### 7. ADD ACTIVITY INVALIDATION STRATEGY
Because an activity creation natively impacts both the global feed (ActivitiesPage) and potentially an unknown Unified Timeline (derived from the complex normalization matrix), a broadcast invalidation is the safest architectural strategy for data coherence:
```javascript
queryClient.invalidateQueries({ queryKey: queryKeys.activities.all() });
```
Targeted invalidation is impossible to guarantee due to the highly dynamic `relatedTo` array resolution. Broad invalidation on write is acceptable.

### 8. UPDATE ACTIVITY CONTRACT

### 9. DELETE ACTIVITY CONTRACT

### 10. SIDE-EFFECT CONTRACT
| Side effect | Mutation | Consumers | Must preserve? | Best future location |
|---|---|---|---|---|
| `confetti()` | Create/Update | UI (Global) | YES | `onSuccess` block of `useMutation` |
| `STAGE_UPDATED` | Create/Update | Pages | YES | `onSuccess` block of `useMutation` |

### 11. ERROR CONTRACT
The legacy Context manually logs and immediately re-throws exceptions using `throw error;`. Existing components already encase mutations within `try/catch` logic to project UI Toasts. The `useMutation().mutateAsync` function perfectly replicates this contract natively.

### 12. REMOVE OR RETAIN loading/pagination?
**REMOVE.**
The forensic trace confirms that `<ActivityProvider>`'s internal `loading` and `pagination` variables are absolutely 100% orphaned. They are unconsumed across the entire codebase. Future TanStack queries will yield `isPending` natively.

### 13. ACTIVITY CONTEXT FINAL TARGET
The legacy `ActivityContext.jsx` file and its `<ActivityProvider>` mount point in `App.jsx` will be entirely obliterated. Zero contextual UI state was identified. All responsibilities structurally belong to React Query hooks within `crmHooks.js`.

### 14. CONSUMER MIGRATION CONTRACT

### 15. CRITICAL PAYLOAD NORMALIZATION AUDIT
| Input field | Existing accepted shapes | Current normalization | Final API shape | Consumers |
|---|---|---|---|---|
| `relatedTo` | `undefined`, Array, null | Initialized to array. Populated from `contactName` and `mobile` if empty. | `[{id, name, model}]` | `addActivity` |
| `participants` | `undefined`, Array, null | Initialized to array. Populated from `contactPhone`/`phone` if empty. | `[{name, mobile}]` | `addActivity` |
| `dueDate` | `undefined`, Missing | Inherits `scheduledDate` or falls back to `new Date()`. | ISO Date String | `addActivity` |
| `details` | `undefined`, Object | Instantiated; `platform='WebCRM'`, `source='ManualForm'` forced. | `{platform, source}

export function useUnifiedActivityQueries(entities = []) {
    return useQueries({
        queries: entities.map(entity => ({
            queryKey: queryKeys.activities.unified(entity.type.toLowerCase(), entity.id),
            queryFn: async () => {
                const res = await activitiesAPI.getUnified(entity.type.toLowerCase(), entity.id);
                if (res && res.success) {
                    return (res.data || []).map(item => ({
                        ...item,
                        sourceEntity: entity.type
                    }));
                }
                return [];
            },
            enabled: !!(entity.type && entity.id),
            staleTime: STALE_TIMES.LIVE
        }))
    });
}

export function useUpdateActivityMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, updates }) => {
            const response = await activitiesAPI.update(id, updates);
            if (!response.success) {
                console.error('[Activity Hooks] backend returned success: false', response);
                return undefined;
            }
            
            if (response.transition?.stageChanged) {
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#3b82f6', '#f59e0b']
                });
                window.dispatchEvent(new CustomEvent('STAGE_UPDATED', { detail: { newStage: response.transition.newStage } }));
            }
            
            return response.data;
        },
        onSuccess: (data) => {
            if (data) {
                queryClient.invalidateQueries({ queryKey: queryKeys.activities.all() });
            }
        }
    });
}

export function useUpdateBookingCommissionMutation(bookingId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const res = await api.patch(`/bookings/${bookingId}/commission`, payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
            window.dispatchEvent(new Event('booking-updated'));
        }
    });
}

export function useUpdateBookingPaymentMutation(bookingId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ paymentId, ...payload }) => {
            const res = await api.put(`/bookings/${bookingId}/payments/${paymentId}`, payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.dashboardStats() });
            window.dispatchEvent(new Event('booking-updated'));
        }
    });
}

export const useUpdateCompanyMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, payload }) => {
            const res = await api.put(`companies/${id}`, payload);
            return res.data;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(variables.id) });
        }
    });
}

export const useUpdateDealMutation = ({ isPartial = false } = {}) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, payload }) => {
            if (isPartial) {
                const res = await api.patch(`/deals/${id}`, payload);
                return res.data;
            } else {
                const res = await api.put(`/deals/${id}`, payload);
                return res.data;
            }
        },
        onSuccess: (data, { id }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.deals.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.pipelineStats() });
        }
    });
}

export function useUpdateInventoryMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }) => {
            const res = await api.put(`/inventory/${id}`, data);
            return res.data;
        },
        onSuccess: (resData, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.lists() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.detail(variables.id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.blocks() });
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.matches({ inventoryId: variables.id }) });
            window.dispatchEvent(new Event('inventory-updated'));
        }
    });
}

export function useUpdateLeadMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, payload, isPartial = false }) => {
            const finalPayload = isPartial ? payload : normalizeLeadRefs(payload);
            
            // Do not override stage on manual edit; let StageEngine handle stage progression via activities
            // We pass it in payload but strip it inside mutation to preserve AddLeadModal behavior
            if (!isPartial && finalPayload.stage) {
                delete finalPayload.stage;
            }
            
            // If the consumer explicitly requests a PATCH semantic (like LeadMatchingPage)
            if (isPartial) {
                 const res = await api.patch(\`/leads/\${id}\`, finalPayload);
                 return res;
            } else {
                 const res = await api.put(\`/leads/\${id}\`, finalPayload);
                 return res;
            }
        },
        onSuccess: (res, variables) => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['lead', variables.id] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
        }
    });
}

export function useUpdateProjectMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }) => {
            const res = await api.put(`/projects/${id}`, data);
            return res.data;
        },
        onSuccess: (resData, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.id) });
        }
    });
}

export function useUpdateUserMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, userData }) => {
            try {
                const response = await api.put(`users/${id}`, userData);
                const result = response.data;
                if (result.success) {
                    return { success: true, data: result.data };
                }
                return result;
            } catch (err) {
                return { success: false, error: err.response?.data?.message || err.message };
            }
        },
        onSuccess: (result) => {
            if (result && result.success) {
                queryClient.invalidateQueries({ queryKey: queryKeys.users() });
            }
        }
    });
}

export function useUploadBookingReceiptMutation(bookingId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ paymentId, receiptUrl }) => {
            const res = await api.post(`/bookings/${bookingId}/payments/${paymentId}/receipt`, { receiptUrl });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
        }
    });
}

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

export function useWhatsAppTemplatesDb() {
    return useQuery({
        queryKey: queryKeys.whatsappTemplates.localDb(),
        queryFn: async () => {
            const res = await systemSettingsAPI.getByKey('crm_whatsapp_templates');
            const dbList = res?.data?.value || null;
            if (dbList && Array.isArray(dbList) && dbList.length > 0) {
                return mergeWithDefaults(dbList);
            }
            return defaultTemplates;
        },
        initialData: defaultTemplates,
        staleTime: 5 * 60 * 1000 // 5 minutes
    });
}

