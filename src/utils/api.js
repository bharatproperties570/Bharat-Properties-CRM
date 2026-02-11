// API Configuration
import axios from 'axios';

export const API_BASE_URL = '/api';

// Create and export axios instance
export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Generic API request handler
const apiRequest = async (endpoint, options = {}) => {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
};

// Roles API
export const rolesAPI = {
    getAll: () => apiRequest('/roles'),
    getById: (id) => apiRequest(`/roles/${id}`),
    create: (data) => apiRequest('/roles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/roles/${id}`, { method: 'DELETE' }),
};

// Projects API
export const projectsAPI = {
    getAll: () => apiRequest('/projects'),
    getById: (id) => apiRequest(`/projects/${id}`),
    create: (data) => apiRequest('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/projects/${id}`, { method: 'DELETE' }),
};

export default {
    lookups: lookupsAPI,
    customFields: customFieldsAPI,
    fieldRules: fieldRulesAPI,
    distributionRules: distributionRulesAPI,
    scoringRules: scoringRulesAPI,
    systemSettings: systemSettingsAPI,
    users: usersAPI,
    roles: rolesAPI,
    projects: projectsAPI,
};
