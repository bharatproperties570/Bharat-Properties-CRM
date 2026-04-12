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
