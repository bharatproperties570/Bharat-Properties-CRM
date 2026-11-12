/**
 * useOperations — React Query hooks for the Operations Center API.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

// ─── Query hooks ──────────────────────────────────────────────────────────────

export const useOperationsSummary = (opts = {}) =>
  useQuery({
    queryKey: ['operations', 'summary'],
    queryFn: () => api.get('/operations/summary').then(r => r.data?.data),
    refetchInterval: 30000,
    staleTime: 10000,
    ...opts,
  });

export const useActiveOperations = (opts = {}) =>
  useQuery({
    queryKey: ['operations', 'active'],
    queryFn: () => api.get('/operations/active').then(r => r.data?.data),
    refetchInterval: 15000,
    staleTime: 5000,
    ...opts,
  });

export const useOperations = (filters = {}, opts = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', Array.isArray(filters.status) ? filters.status.join(',') : filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.channel) params.set('channel', filters.channel);
  if (filters.page) params.set('page', filters.page);
  if (filters.limit) params.set('limit', filters.limit);
  const qs = params.toString();

  return useQuery({
    queryKey: ['operations', 'list', qs],
    queryFn: () => api.get(`/operations?${qs}`).then(r => r.data),
    staleTime: 10000,
    ...opts,
  });
};

export const useOperation = (jobId, opts = {}) =>
  useQuery({
    queryKey: ['operations', 'detail', jobId],
    queryFn: () => api.get(`/operations/${jobId}`).then(r => r.data?.data),
    enabled: !!jobId,
    refetchInterval: 10000,
    ...opts,
  });

export const useOperationEvents = (jobId, page = 1, opts = {}) =>
  useQuery({
    queryKey: ['operations', 'events', jobId, page],
    queryFn: () => api.get(`/operations/${jobId}/events?page=${page}`).then(r => r.data),
    enabled: !!jobId,
    ...opts,
  });

export const useWorkerHealth = (opts = {}) =>
  useQuery({
    queryKey: ['operations', 'workers'],
    queryFn: () => api.get('/operations/workers').then(r => r.data?.data),
    refetchInterval: 30000,
    ...opts,
  });

export const useQueueHealth = (opts = {}) =>
  useQuery({
    queryKey: ['operations', 'queues'],
    queryFn: () => api.get('/operations/queues').then(r => r.data?.data),
    refetchInterval: 30000,
    ...opts,
  });

export const useAlerts = (filters = {}, opts = {}) => {
  const params = new URLSearchParams();
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.resolved !== undefined) params.set('resolved', filters.resolved);
  if (filters.page) params.set('page', filters.page);
  const qs = params.toString();

  return useQuery({
    queryKey: ['operations', 'alerts', qs],
    queryFn: () => api.get(`/operations/alerts?${qs}`).then(r => r.data),
    refetchInterval: 30000,
    ...opts,
  });
};

export const useAlertSummary = (opts = {}) =>
  useQuery({
    queryKey: ['operations', 'alertSummary'],
    queryFn: () => api.get('/operations/alerts/summary').then(r => r.data?.data),
    refetchInterval: 30000,
    ...opts,
  });

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export const usePauseOperation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId) => api.post(`/operations/${jobId}/pause`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations'] }); },
  });
};

export const useResumeOperation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId) => api.post(`/operations/${jobId}/resume`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations'] }); },
  });
};

export const useCancelOperation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId) => api.post(`/operations/${jobId}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations'] }); },
  });
};

export const useRetryOperation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId) => api.post(`/operations/${jobId}/retry`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations'] }); },
  });
};

export const useAcknowledgeAlert = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId) => api.post(`/operations/alerts/${alertId}/acknowledge`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations', 'alerts'] }); },
  });
};

export const useResolveAlert = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId) => api.post(`/operations/alerts/${alertId}/resolve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations', 'alerts'] }); },
  });
};

// ─── Import hooks ─────────────────────────────────────────────────────────────

export const useImportUpload = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, entityType }) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entityType', entityType);
      return api.post('/imports/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations'] }); },
  });
};

export const useImportStatus = (importJobId, opts = {}) =>
  useQuery({
    queryKey: ['imports', importJobId],
    queryFn: () => api.get(`/imports/${importJobId}`).then(r => r.data?.data),
    enabled: !!importJobId,
    refetchInterval: 5000,
    ...opts,
  });

export const useImportPreview = (importJobId, opts = {}) =>
  useQuery({
    queryKey: ['imports', importJobId, 'preview'],
    queryFn: () => api.get(`/imports/${importJobId}/preview`).then(r => r.data?.data),
    enabled: !!importJobId,
    ...opts,
  });

export const useSetMapping = () =>
  useMutation({
    mutationFn: ({ importJobId, columnMapping }) =>
      api.post(`/imports/${importJobId}/mapping`, { columnMapping }).then(r => r.data),
  });

export const useValidateImport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (importJobId) =>
      api.post(`/imports/${importJobId}/validate`).then(r => r.data),
    onSuccess: (_, importJobId) => { qc.invalidateQueries({ queryKey: ['imports', importJobId] }); },
  });
};

export const useApproveImport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (importJobId) =>
      api.post(`/imports/${importJobId}/approve`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations'] }); },
  });
};

// ─── Export hooks ─────────────────────────────────────────────────────────────

export const useInitiateExport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/exports', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations'] }); },
  });
};

export const useExportStatus = (exportJobId, opts = {}) =>
  useQuery({
    queryKey: ['exports', exportJobId],
    queryFn: () => api.get(`/exports/${exportJobId}`).then(r => r.data?.data),
    enabled: !!exportJobId,
    refetchInterval: 5000,
    ...opts,
  });

export const useExports = (opts = {}) =>
  useQuery({
    queryKey: ['exports', 'list'],
    queryFn: () => api.get('/exports').then(r => r.data),
    ...opts,
  });

export const useCancelImport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (importJobId) =>
      api.post(`/imports/${importJobId}/cancel`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operations'] }); },
  });
};
