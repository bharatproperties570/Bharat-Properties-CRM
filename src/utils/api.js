// API Configuration
import axios from 'axios';

const isProd = import.meta.env.PROD;
// In production, we default to the relative '/api' which is then proxied by vercel.json
// or we use the explicit VITE_API_URL if provided in the Vercel dashboard environments.
export const API_BASE_URL = import.meta.env.VITE_API_URL || (isProd ? '/api' : 'http://localhost:4000/api');
export const BASE_BACKEND_URL = API_BASE_URL.replace(/\/api$/, '');

// Notification APIs
export const marketingAPI = {
    getStats: () => api.get('/marketing/stats').then(res => res.data),
    getCampaignHistory: () => api.get('/marketing/campaign-runs').then(res => res.data),
    getRecentDeals: () => api.get('/marketing/recent-deals').then(res => res.data),
    generateSocial: (dealId, platform) => api.post('/marketing/generate-social', { dealId, platform }).then(res => res.data),
    generateEmail: (dealId, audience) => api.post('/marketing/generate-email', { dealId, audience }).then(res => res.data),
    runAgent: () => api.post('/marketing/run-agent').then(res => res.data),

    // ── AI Model-Aware Generation (used by 4-agent hub in MarketingOverviewPage) ──
    // provider: 'google' | 'openai'  |  model: 'gemini-1.5-pro' | 'gpt-4o' | 'gemini-1.5-flash'
    generateWithModel: (payload) =>
        api.post('/marketing/generate-with-model', payload).then(res => res.data),

    // ── Campaign Launchers (Email / WhatsApp / SMS / RCS) ──
    sendCampaign: (channel, data) =>
        api.post('/marketing/send-campaign', { channel, ...data }).then(res => res.data),

    // ── Drip / Sequence Activation ──
    activateDrip: (leadId, sequenceId) =>
        api.post('/marketing/activate-drip', { leadId, sequenceId }).then(res => res.data),

    // LinkedIn Integration
    getLinkedInAuthUrl: () => api.get('/marketing/linkedin/auth-url').then(res => res.data),
    handleLinkedInCallback: (code) => api.post('/marketing/linkedin/callback', { code }).then(res => res.data),
    getLinkedInStatus: () => api.get('/marketing/linkedin/status').then(res => res.data),
    saveLinkedInConfig: (config) => api.post('/marketing/linkedin/config', config).then(res => res.data),

    // ── Neural Persistence (Content CRUD) ──
    getContent: (params) => api.get('/marketing/content', { params }).then(res => res.data),
    saveContent: (data) => api.post('/marketing/content', data).then(res => res.data),
    deleteContent: (id) => api.delete(`/marketing/content/${id}`).then(res => res.data),
    publishContent: (contentId, phoneNumber) => api.post('/marketing/publish', { contentId, phoneNumber }).then(res => res.data),
    triggerLinkedInSync: () => api.post('/marketing/linkedin/trigger-sync').then(res => res.data),
};

export const socialAPI = {
    getStatus: () => api.get('/social/status').then(res => res.data),
    saveConfig: (platform, config) => api.post('/social/config/enterprise', { platform, config }).then(res => res.data),
    getUnifiedStatus: () => api.get('/social/status/unified').then(res => res.data),
    // WhatsApp Meta Cloud API (Isolated Route for Reliability)
    saveWhatsAppConfig: (config) => api.post('/whatsapp-config/save', config).then(res => res.data),
    getWhatsAppTemplates: () => api.get('/whatsapp-config/templates').then(res => res.data),
    postContent: (data) => api.post('/social/post', data).then(res => res.data),
    getAnalytics: (objectId, platform) => api.get('/social/analytics', { params: { objectId, platform } }).then(res => res.data),
    getInstagramComments: (mediaId) => api.get('/social/ig/comments', { params: { mediaId } }).then(res => res.data),
    getFacebookComments: (postId) => api.get('/social/fb/comments', { params: { postId } }).then(res => res.data),
    replyToComment: (commentId, message) => api.post('/social/comment/reply', { commentId, message }).then(res => res.data),
    likeComment: (commentId) => api.post('/social/comment/like', { commentId }).then(res => res.data),
    testConnection: () => api.post('/social/test-connection').then(res => res.data),
};

export const getNotifications = () => api.get('/notifications');
export const markNotificationAsRead = (id) => api.put(`/notifications/${id}/read`);
export const markAllNotificationsAsRead = () => api.put('/notifications/read-all');

// Create and export axios instance
export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

// Add a request interceptor to inject the token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add a response interceptor to handle 401 errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            console.warn('Unauthorized request detected. Clearing session...');
            localStorage.removeItem('authToken');
            // Dispatch custom event to notify listeners (like UserContext)
            window.dispatchEvent(new CustomEvent('unauthorized-token'));
        }
        return Promise.reject(error);
    }
);

// Simple request cache to prevent redundant simultaneous calls
const pendingRequests = new Map();

// Generic API request handler
const apiRequest = async (endpoint, options = {}) => {
    // Generate a cache key for GET requests to deduplicate simultaneous identical calls
    const cacheKey = options.method && options.method !== 'GET' ? null : `${endpoint}-${JSON.stringify(options.params || {})}`;

    if (cacheKey && pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
        try {
            const cleanBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            let url = `${cleanBaseUrl}${cleanEndpoint}`;

            // Handle query parameters
            if (options.params) {
                const queryParams = new URLSearchParams();
                Object.entries(options.params).forEach(([key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        queryParams.append(key, value);
                    }
                });
                const queryString = queryParams.toString();
                if (queryString) {
                    url += (url.includes('?') ? '&' : '?') + queryString;
                }
                delete options.params;
            }

            const token = localStorage.getItem('authToken');

            const response = await fetch(url, {
                headers: {
                    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    ...options.headers,
                },
                ...options,
            });

            const contentType = response.headers.get("content-type");
            const isJson = contentType && contentType.includes("application/json");

            if (!response.ok) {
                if (response.status === 401) {
                    console.warn('Unauthorized fetch request detected.');
                    localStorage.removeItem('authToken');
                    window.dispatchEvent(new CustomEvent('unauthorized-token'));
                    throw new Error('Unauthorized access');
                }

                if (response.status === 429) {
                    const error = new Error('Too many requests. Please wait a moment and try again.');
                    error.status = 429;
                    throw error;
                }
                let errorMessage = 'API request failed';
                if (isJson) {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                } else {
                    errorMessage = `Error ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            if (isJson) {
                return await response.json();
            }

            const text = await response.text();
            
            // Critical Check: Detect if we got an HTML page instead of API response 
            // (Common when Vercel rewrites fail or proxy is misconfigured)
            if (text.trim().startsWith('<!DOCTYPE html') || text.trim().startsWith('<html')) {
                const error = new Error('Invalid API Response: Received HTML instead of Data. This usually indicates a proxy or routing configuration error at the server.');
                error.name = 'ProxyConfigError';
                throw error;
            }

            return text;
        } catch (error) {
            const cleanBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const fullUrl = `${cleanBaseUrl}${cleanEndpoint}`;
            
            console.error(`❌ API Error [${endpoint}]:`, {
                message: error.message,
                url: fullUrl,
                baseUrl: API_BASE_URL,
                stack: error.stack
            });
            throw error;
        } finally {
            if (cacheKey) pendingRequests.delete(cacheKey);
        }
    })();

    if (cacheKey) {
        pendingRequests.set(cacheKey, requestPromise);
    }

    return requestPromise;
};

// Lookups API
export const lookupsAPI = {
    getAll: () => apiRequest('/lookups'),
    getByCategory: (category) => apiRequest(`/lookups?lookup_type=${encodeURIComponent(category)}`),
    getStates: () => apiRequest('/lookups?lookup_type=State'),
    getCities: (stateId) => apiRequest(`/lookups?lookup_type=City&parent_lookup_id=${stateId}`),
    getLocations: (cityId) => apiRequest(`/lookups?parent_lookup_id=${cityId}`),
    create: (data) => apiRequest('/lookups', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/lookups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/lookups/${id}`, { method: 'DELETE' }),
    bulkCreate: (data) => apiRequest('/lookups/bulk', { method: 'POST', body: JSON.stringify(data) }),
};

// Custom Fields API
export const customFieldsAPI = {
    getAll: () => apiRequest('/custom-fields'),
    getByModule: (module) => apiRequest(`/custom-fields/module/${module}`),
    create: (data) => apiRequest('/custom-fields', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/custom-fields/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/custom-fields/${id}`, { method: 'DELETE' }),
};

// Field Rules API
export const fieldRulesAPI = {
    getAll: () => apiRequest('/field-rules'),
    getByModule: (module) => apiRequest(`/field-rules/module/${module}`),
    create: (data) => apiRequest('/field-rules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/field-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/field-rules/${id}`, { method: 'DELETE' }),
    evaluate: (module, data) => apiRequest('/field-rules/evaluate', {
        method: 'POST',
        body: JSON.stringify({ module, data })
    }),
};

// Distribution Rules API
export const distributionRulesAPI = {
    getAll: () => apiRequest('/distribution-rules'),
    getByEntity: (entity) => apiRequest(`/distribution-rules/entity/${entity}`),
    create: (data) => apiRequest('/distribution-rules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/distribution-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/distribution-rules/${id}`, { method: 'DELETE' }),
    assign: (entity, data) => apiRequest('/distribution-rules/assign', {
        method: 'POST',
        body: JSON.stringify({ entity, data })
    }),
};

// Scoring Rules API
export const scoringRulesAPI = {
    getAll: () => apiRequest('/scoring-rules'),
    create: (data) => apiRequest('/scoring-rules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/scoring-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/scoring-rules/${id}`, { method: 'DELETE' }),
    calculate: (leadData) => apiRequest('/scoring-rules/calculate', {
        method: 'POST',
        body: JSON.stringify(leadData)
    }),
};

// System Settings API
export const systemSettingsAPI = {
    getAll: () => apiRequest('/system-settings'),
    getByKey: (key) => apiRequest(`/system-settings/${key}`),
    upsert: (key, data) => apiRequest('/system-settings/upsert', {
        method: 'POST',
        body: JSON.stringify({ key, ...data })
    }),
    testAi: (type, config) => apiRequest('/system-settings/test-ai', {
        method: 'POST',
        body: JSON.stringify({ type, config })
    }),
    delete: (key) => apiRequest(`/system-settings/${key}`, { method: 'DELETE' }),
};

// Google Integration Settings API
export const googleSettingsAPI = {
    getAuthUrl: () => apiRequest('/settings/google/url'),
    handleCallback: (code) => apiRequest('/settings/google/callback', { method: 'POST', body: JSON.stringify({ code }) }),
    getStatus: () => apiRequest('/settings/google/status'),
    disconnect: () => apiRequest('/settings/google/disconnect', { method: 'POST' }),
};

// Integration API
export const integrationSettingsAPI = {
    getSettings: () => apiRequest('/settings/ai'),
    updateSettings: (data) => apiRequest('/settings/ai', { method: 'POST', body: JSON.stringify(data) }),
    getAvailableAi: () => apiRequest('/settings/ai/available-ai')
};

// AI Settings API
export const aiSettingsAPI = {
    getSettings: () => apiRequest('/settings/ai'),
    updateSettings: (data) => apiRequest('/settings/ai', { method: 'POST', body: JSON.stringify(data) }),
};

// Conversation API
export const conversationAPI = {
    getActive: () => apiRequest('/conversations/active'),
    updateStatus: (id, status) => apiRequest(`/conversations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};

// Users API
export const usersAPI = {
    getAll: () => apiRequest('/users'),
    getById: (id) => apiRequest(`/users/${id}`),
    create: (data) => apiRequest('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/users/${id}`, { method: 'DELETE' }),
    toggleStatus: (id, data) => apiRequest(`/users/${id}/status`, { method: 'POST', body: JSON.stringify(data) }),
};

// Roles API
export const rolesAPI = {
    getAll: () => apiRequest('/roles'),
    getById: (id) => apiRequest(`/roles/${id}`),
    create: (data) => apiRequest('/roles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id, force = false) => apiRequest(`/roles/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
};

// Projects API
export const projectsAPI = {
    getAll: () => apiRequest('/projects'),
    getById: (id) => apiRequest(`/projects/${id}`),
    create: (data) => apiRequest('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/projects/${id}`, { method: 'DELETE' }),
};

// Deals API
export const dealsAPI = {
    getAll: (params) => apiRequest('/deals', { params }),
    getById: (id) => apiRequest(`/deals/${id}`),
    create: (data) => apiRequest('/deals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/deals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/deals/${id}`, { method: 'DELETE' }),
};

// Leads API
export const leadsAPI = {
    getAll: (params) => apiRequest('/leads', { params }),
    getById: (id) => apiRequest(`/leads/${id}`),
    create: (data) => apiRequest('/leads', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/leads/${id}`, { method: 'DELETE' }),
    recalculateScore: (leadId) => apiRequest(`/activities/leads/${leadId}/recalculate-score`, { method: 'POST' }),
};

// Contacts API
export const contactsAPI = {
    getAll: (params) => apiRequest('/contacts', { params }),
    getById: (id) => apiRequest(`/contacts/${id}`),
    create: (data) => apiRequest('/contacts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/contacts/${id}`, { method: 'DELETE' }),
    syncAll: () => apiRequest('/contacts/sync-all', { method: 'POST' }),
};

// Activities API
export const activitiesAPI = {
    getAll: (params) => apiRequest('/activities', { params }),
    getMessagingStream: (params) => apiRequest('/activities/messaging', { params }),
    getById: (id) => apiRequest(`/activities/${id}`),
    getUnified: (type, id) => apiRequest(`/activities/unified/${type}/${id}`),
    create: (data) => apiRequest('/activities', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/activities/${id}`, { method: 'DELETE' }),
    // ── Unified Backend Pipeline: Stage + Scoring ──
    complete: (id, data) => apiRequest(`/activities/${id}/complete`, { method: 'POST', body: JSON.stringify(data) }),
    completeWithForm: (id, data) => apiRequest(`/activities/${id}/complete-with-form`, { method: 'POST', body: JSON.stringify(data) }),
};

// Stage Transition Rules API
export const stageTransitionRulesAPI = {
    getAll: () => apiRequest('/rules/stage-transitions'),
    save: (rules) => apiRequest('/rules/stage-transitions', { method: 'POST', body: JSON.stringify({ rules }) }),
    add: (rule) => apiRequest('/rules/stage-transitions/add', { method: 'POST', body: JSON.stringify(rule) }),
    update: (ruleId, data) => apiRequest(`/rules/stage-transitions/${ruleId}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (ruleId) => apiRequest(`/rules/stage-transitions/${ruleId}`, { method: 'DELETE' }),
    seedDefaults: () => apiRequest('/rules/stage-transitions/seed', { method: 'POST' }),
};

// Email API
export const emailAPI = {
    getInbox: () => apiRequest('/email/inbox'),
    send: (data) => apiRequest('/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    testConnection: () => apiRequest('/email/test-connection', {
        method: 'POST'
    }),
    getContent: (uid) => apiRequest(`/email/content/${uid}`),
    getOAuthUrl: () => apiRequest('/email/oauth/url'),
    convertToLead: (uid) => apiRequest(`/email/convert-to-lead/${uid}`, { method: 'POST' }),
};

// Teams API
export const teamsAPI = {
    getAll: (params) => apiRequest('/teams', { params }),
    getById: (id) => apiRequest(`/teams/${id}`),
    create: (data) => apiRequest('/teams', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/teams/${id}`, { method: 'DELETE' }),
};

// Enrichment API
export const enrichmentAPI = {
    getRules: () => apiRequest('/enrichment/rules'),
    async saveKeywordRule(data) {
        return apiRequest('/enrichment/rules/keyword', { method: 'POST', body: data });
    },
    async deleteKeywordRule(id) {
        return apiRequest(`/enrichment/rules/keyword/${id}`, { method: 'DELETE' });
    },
    async saveGeneralRule(data) {
        return apiRequest('/enrichment/rules/general', { method: 'POST', body: data });
    },
    runLead: (leadId) => apiRequest(`/enrichment/run/lead/${leadId}`, { method: 'POST' }),
    runDeal: (dealId) => apiRequest(`/enrichment/run/deal/${dealId}`, { method: 'POST' }),
    getLogs: (params) => apiRequest('/enrichment/logs', { params }),
};

// Parsing Rules API
export const parsingRulesAPI = {
    getAll: () => apiRequest('/parsing-rules'),
    create: (data) => apiRequest('/parsing-rules', { method: 'POST', body: JSON.stringify(data) }),
    bulkCreate: (data) => apiRequest('/parsing-rules/bulk', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/parsing-rules/${id}`, { method: 'DELETE' }),
};

// Intake API
export const intakeAPI = {
    getAll: () => apiRequest('/intake'),
    getById: (id) => apiRequest(`/intake/${id}`),
    createIntake: (data) => apiRequest('/intake', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id, status) => apiRequest(`/intake/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    uploadZip: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return apiRequest('/intake/zip', { method: 'POST', body: formData });
    },
    uploadPdf: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return apiRequest('/intake/pdf', { method: 'POST', body: formData });
    },
    uploadOcr: (file) => {
        const formData = new FormData();
        formData.append('image', file);
        return apiRequest('/intake/ocr', { method: 'POST', body: formData });
    },
};

// Auth API
export const authAPI = {
    login: (credentials) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    register: (data) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    getMe: () => apiRequest('/auth/me', { method: 'GET' }),
};

// AI Agents API
export const aiAgentsAPI = {
    getAll: () => apiRequest('/settings/ai-agents'),
    getById: (id) => apiRequest(`/settings/ai-agents/${id}`),
    create: (data) => apiRequest('/settings/ai-agents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/settings/ai-agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/settings/ai-agents/${id}`, { method: 'DELETE' }),
};

export default {
    auth: authAPI,
    aiAgents: aiAgentsAPI,
    users: usersAPI,
    roles: rolesAPI,
    leads: leadsAPI,
    contacts: contactsAPI,
    projects: projectsAPI,
    teams: teamsAPI,
    activities: activitiesAPI,
    lookups: lookupsAPI,
    customFields: customFieldsAPI,
    fieldRules: fieldRulesAPI,
    distributionRules: distributionRulesAPI,
    scoringRules: scoringRulesAPI,
    stageTransitionRules: stageTransitionRulesAPI,
    systemSettings: systemSettingsAPI,
    settings: systemSettingsAPI, // Map settings to systemSettingsAPI for compatibility
    deals: dealsAPI,
    enrichment: enrichmentAPI,
    parsingRules: parsingRulesAPI,
    intake: intakeAPI,
    googleSettings: googleSettingsAPI,
    aiSettings: aiSettingsAPI,
    conversations: conversationAPI,
    social: socialAPI
};
