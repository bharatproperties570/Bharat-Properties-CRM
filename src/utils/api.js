// API Configuration
import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.bharatproperties.co/api';

// Create and export axios instance
export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

// Generic API request handler
const apiRequest = async (endpoint, options = {}) => {
    try {
        const cleanBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${cleanBaseUrl}${cleanEndpoint}`;

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
            // Remove params from options so it's not passed to fetch
            delete options.params;
        }

        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        // Get content type
        const contentType = response.headers.get("content-type");
        const isJson = contentType && contentType.includes("application/json");

        if (!response.ok) {
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

        return await response.text();
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
    }
};

// Lookups API
export const lookupsAPI = {
    getAll: () => apiRequest('/lookups'),
    getByCategory: (category) => apiRequest(`/lookups?lookup_type=${category}`),
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
    delete: (key) => apiRequest(`/system-settings/${key}`, { method: 'DELETE' }),
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
};

// Contacts API
export const contactsAPI = {
    getAll: (params) => apiRequest('/contacts', { params }),
    getById: (id) => apiRequest(`/contacts/${id}`),
    create: (data) => apiRequest('/contacts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/contacts/${id}`, { method: 'DELETE' }),
};

// Activities API
export const activitiesAPI = {
    getAll: (params) => apiRequest('/activities', { params }),
    getById: (id) => apiRequest(`/activities/${id}`),
    create: (data) => apiRequest('/activities', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/activities/${id}`, { method: 'DELETE' }),
};

// Teams API
export const teamsAPI = {
    getAll: (params) => apiRequest('/teams', { params }),
    getById: (id) => apiRequest(`/teams/${id}`),
    create: (data) => apiRequest('/teams', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/teams/${id}`, { method: 'DELETE' }),
};

export default {
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
    systemSettings: systemSettingsAPI,
    settings: systemSettingsAPI, // Map settings to systemSettingsAPI for compatibility
    deals: dealsAPI
};
