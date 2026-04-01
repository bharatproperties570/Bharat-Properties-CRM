import axios from 'axios';
import SystemSetting from '../models/SystemSetting.js';

/**
 * GeminiService.js
 * Handles interactions with Google Gemini AI models.
 */
class GeminiService {
    /**
     * Get Gemini configuration from SystemSettings
     */
    async _getConfig() {
        const config = await SystemSetting.findOne({ key: 'ai_gemini_config' });
        return config?.value || {};
    }

    /**
     * Test a Gemini API connection
     * @param {Object} manualConfig - Optional manual config to test before saving
     */
    async testConnection(manualConfig = null) {
        try {
            const config = manualConfig || await this._getConfig();
            const apiKey = config.apiKey;
            const model = config.model || 'gemini-1.5-pro';
            const apiVersion = config.apiVersion || 'v1'; // Default to stable v1

            if (!apiKey) {
                throw new Error('Gemini API Key is missing');
            }

            // Try stable v1 first, then v1beta if needed
            const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
            
            console.log(`[GeminiService] Testing connection using ${apiVersion} and model ${model}`);
            
            const response = await axios.post(url, {
                contents: [{
                    parts: [{ text: 'Hello, are you active?' }]
                }]
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data && response.data.candidates) {
                return { success: true, message: `Gemini API (${apiVersion}) is active and responding!` };
            } else {
                throw new Error('Invalid response from Gemini API');
            }
        } catch (err) {
            const errorMsg = err.response?.data?.error?.message || err.message;
            console.error('[GeminiService] testConnection error:', errorMsg);
            
            // Auto-fallback to v1beta if v1 fails with "not found"
            if (manualConfig === null && !manualConfig?.apiVersion && (errorMsg.includes('not found') || err.response?.status === 404)) {
                console.log('[GeminiService] Retrying with v1beta...');
                return await this.testConnection({ ...(manualConfig || await this._getConfig()), apiVersion: 'v1beta' });
            }

            return { 
                success: false, 
                error: errorMsg 
            };
        }
    }

    /**
     * Generate content using Gemini
     * @param {string} prompt 
     */
    async generateContent(prompt) {
        try {
            const config = await this._getConfig();
            const apiKey = config.apiKey;
            const model = config.model || 'gemini-1.5-pro';
            const apiVersion = config.apiVersion || 'v1';

            if (!apiKey) throw new Error('Gemini API Key not configured');

            const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
            const response = await axios.post(url, {
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024,
                }
            });

            if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return response.data.candidates[0].content.parts[0].text;
            }
            
            throw new Error('Empty response from Gemini');
        } catch (err) {
            console.error('[GeminiService] generateContent error:', err.message);
            
            // If it's a 404/not found on v1, try one-off with v1beta
            if (err.response?.status === 404) {
                // ... logic to retry or just throw
            }
            throw err;
        }
    }
}

export default new GeminiService();
