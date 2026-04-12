import axios from 'axios';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * ClaudeService.js
 * Handles interactions with Anthropic Claude models.
 */
class ClaudeService {
    /**
     * Get Claude configuration from SystemSettings
     */
    async _getConfig() {
        const config = await SystemSetting.findOne({ key: 'ai_claude_config' });
        return config?.value || {};
    }

    /**
     * Test a Claude API connection
     * @param {Object} manualConfig - Optional manual config to test before saving
     */
    async testConnection(manualConfig = null) {
        try {
            const config = manualConfig || await this._getConfig();
            const apiKey = config.apiKey;
            const model = config.model || 'claude-3-5-sonnet-20240620';

            if (!apiKey) {
                throw new Error('Claude API Key is missing');
            }

            const url = 'https://api.anthropic.com/v1/messages';
            const response = await axios.post(url, {
                model: model,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hello, are you active?' }]
            }, {
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }
            });

            if (response.data && response.data.content) {
                return { success: true, message: 'Claude API is active and responding!' };
            } else {
                throw new Error('Invalid response from Claude API');
            }
        } catch (err) {
            console.error('[ClaudeService] testConnection error:', err.response?.data || err.message);
            return { 
                success: false, 
                error: err.response?.data?.error?.message || err.message 
            };
        }
    }

    /**
     * Generate content using Claude
     * @param {string} prompt 
     */
    async generateContent(prompt) {
        try {
            const config = await this._getConfig();
            const apiKey = config.apiKey;
            const model = config.model || 'claude-3-5-sonnet-20240620';

            if (!apiKey) throw new Error('Claude API Key not configured');

            const url = 'https://api.anthropic.com/v1/messages';
            const response = await axios.post(url, {
                model: model,
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }
            });

            return response.data.content[0].text;
        } catch (err) {
            console.error('[ClaudeService] generateContent error:', err.message);
            throw err;
        }
    }
}

export default new ClaudeService();
