import axios from 'axios';
import SystemSetting from '../models/SystemSetting.js';

/**
 * OpenAIService.js
 * Handles interactions with OpenAI GPT models.
 */
class OpenAIService {
    /**
     * Get OpenAI configuration from SystemSettings
     */
    async _getConfig() {
        const config = await SystemSetting.findOne({ key: 'ai_openai_config' });
        return config?.value || {};
    }

    /**
     * Test an OpenAI API connection
     * @param {Object} manualConfig - Optional manual config to test before saving
     */
    async testConnection(manualConfig = null) {
        try {
            const config = manualConfig || await this._getConfig();
            const apiKey = config.apiKey;
            const model = config.model || 'gpt-4o';

            if (!apiKey) {
                throw new Error('OpenAI API Key is missing');
            }

            const url = 'https://api.openai.com/v1/chat/completions';
            const response = await axios.post(url, {
                model: model,
                messages: [{ role: 'user', content: 'Hello, are you active?' }],
                max_tokens: 10
            }, {
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (response.data && response.data.choices) {
                return { success: true, message: 'OpenAI API is active and responding!' };
            } else {
                throw new Error('Invalid response from OpenAI API');
            }
        } catch (err) {
            console.error('[OpenAIService] testConnection error:', err.response?.data || err.message);
            return { 
                success: false, 
                error: err.response?.data?.error?.message || err.message 
            };
        }
    }

    /**
     * Generate content using OpenAI
     * @param {string} prompt 
     */
    async generateContent(prompt) {
        try {
            const config = await this._getConfig();
            const apiKey = config.apiKey;
            const model = config.model || 'gpt-4o';

            if (!apiKey) throw new Error('OpenAI API Key not configured');

            const url = 'https://api.openai.com/v1/chat/completions';
            const response = await axios.post(url, {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 1024,
            }, {
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            return response.data.choices[0].message.content;
        } catch (err) {
            console.error('[OpenAIService] generateContent error:', err.message);
            throw err;
        }
    }
}

export default new OpenAIService();
