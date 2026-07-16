import { api } from '../utils/api';

const whatsappService = {
    /**
     * Send a WhatsApp message (Standard or Media)
     */
    async sendMessage(payload) {
        try {
            // payload: { mobile, message, type, mediaUrl, filename, caption }
            const response = await api.post('whatsapp-config/send', payload);
            return response.data;
        } catch (error) {
            console.error('Error sending WhatsApp message:', error);
            throw error;
        }
    },

    /**
     * Fetch WhatsApp templates from Meta
     */
    async getTemplates() {
        try {
            const response = await api.get('whatsapp-config/templates');
            return response.data;
        } catch (error) {
            console.error('Error fetching WhatsApp templates:', error);
            throw error;
        }
    },
    /**
     * Fetch WhatsApp templates directly from Meta API (Sync Down)
     */
    async syncTemplatesFromMeta() {
        try {
            const response = await api.get('whatsapp-config/sync-meta');
            return response.data;
        } catch (error) {
            console.error('Error syncing templates from Meta:', error);
            throw error;
        }
    },

    /**
     * Submit a new template to Meta for review/approval (Sync Up)
     */
    async submitTemplateToMeta(templateData) {
        try {
            const response = await api.post('whatsapp-config/submit-template', templateData);
            return response.data;
        } catch (error) {
            console.error('Error submitting template to Meta:', error);
            throw error;
        }
    },
    /**
     * Preview template compilation from the backend
     */
    async previewTemplate(payload) {
        try {
            // payload: { template, channel, recipient, properties }
            const response = await api.post('whatsapp-config/preview', payload);
            return response.data;
        } catch (error) {
            console.error('Error previewing template:', error);
            throw error;
        }
    },

    /**
     * Save/Update WhatsApp configuration
     */
    async saveConfig(config) {
        try {
            const response = await api.post('whatsapp-config/save', config);
            return response.data;
        } catch (error) {
            console.error('Error saving WhatsApp config:', error);
            throw error;
        }
    }
};

export default whatsappService;
