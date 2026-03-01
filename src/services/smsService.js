import axios from 'axios';

const API_BASE_URL = 'http://localhost:4000/api/sms-gateway';

const smsService = {
    /**
     * Fetch all configured providers
     */
    async getProviders() {
        try {
            const response = await axios.get(API_BASE_URL);
            return response.data;
        } catch (error) {
            console.error('Error fetching SMS providers:', error);
            throw error;
        }
    },

    /**
     * Update configuration for a provider
     */
    async updateConfig(provider, config) {
        try {
            const response = await axios.post(`${API_BASE_URL}/config`, {
                provider,
                config
            });
            return response.data;
        } catch (error) {
            console.error(`Error updating ${provider} config:`, error);
            throw error;
        }
    },

    /**
     * Activate a provider
     */
    async activateProvider(provider) {
        try {
            const response = await axios.patch(`${API_BASE_URL}/activate/${provider}`);
            return response.data;
        } catch (error) {
            console.error(`Error activating ${provider}:`, error);
            throw error;
        }
    },

    /**
     * Test a provider connection
     */
    async testConnection(provider, phone, message, config = null) {
        try {
            const response = await axios.post(`${API_BASE_URL}/test`, {
                provider,
                phone,
                message,
                config
            });
            return response.data;
        } catch (error) {
            console.error(`Error testing ${provider} connection:`, error);
            throw error;
        }
    },

    /**
     * Fetch all SMS templates
     */
    async getTemplates() {
        try {
            const response = await axios.get(`${API_BASE_URL}/templates`);
            return response.data;
        } catch (error) {
            console.error('Error fetching SMS templates:', error);
            throw error;
        }
    },

    /**
     * Create or update an SMS template
     */
    async saveTemplate(templateData) {
        try {
            const response = await axios.post(`${API_BASE_URL}/templates`, templateData);
            return response.data;
        } catch (error) {
            console.error('Error saving SMS template:', error);
            throw error;
        }
    },

    /**
     * Delete an SMS template
     */
    async deleteTemplate(id) {
        try {
            const response = await axios.delete(`${API_BASE_URL}/templates/${id}`);
            return response.data;
        } catch (error) {
            console.error('Error deleting SMS template:', error);
            throw error;
        }
    },

    /**
     * Fetch SMS logs
     */
    async getLogs(params = {}) {
        try {
            const response = await axios.get(`${API_BASE_URL}/logs`, { params });
            return response.data;
        } catch (error) {
            console.error('Error fetching SMS logs:', error);
            throw error;
        }
    }
};

export default smsService;
