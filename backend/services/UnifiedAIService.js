import openAIService from './OpenAIService.js';
import geminiService from './GeminiService.js';
import claudeService from './ClaudeService.js';
import SystemSetting from '../models/SystemSetting.js';

/**
 * UnifiedAIService.js
 * A provider-agnostic AI wrapper with automatic failover capabilities.
 */
class UnifiedAIService {
    /**
     * Get preferred AI provider from system settings
     */
    async _getPreferredProvider() {
        const setting = await SystemSetting.findOne({ key: 'ai_preferred_provider' });
        return setting?.value || 'openai'; // Default to OpenAI
    }

    /**
     * Unified generate method with fallback support
     * @param {string} prompt 
     * @param {Object} options - { provider, temperature, maxTokens }
     */
    async generate(prompt, options = {}) {
        const preferred = options.provider || await this._getPreferredProvider();
        const providers = [preferred, 'openai', 'gemini', 'claude'].filter((v, i, a) => a.indexOf(v) === i); // Deduplicate

        let lastError = null;

        for (const provider of providers) {
            try {
                console.log(`[UnifiedAI] Attempting generation with: ${provider}`);
                switch (provider) {
                    case 'openai':
                        return await openAIService.generateContent(prompt);
                    case 'gemini':
                        return await geminiService.generateContent(prompt);
                    case 'claude':
                        return await claudeService.generateContent(prompt);
                    default:
                        continue;
                }
            } catch (err) {
                console.warn(`[UnifiedAI] ${provider} failed:`, err.message);
                lastError = err;
                // Continue to next provider in the failover chain
            }
        }

        throw new Error(`UnifiedAI failed. No AI providers (OpenAI, Gemini, Claude) are currently configured with valid API keys in Settings > Integrations.`);
    }

    /**
     * Test connection for a specific provider
     */
    async testProvider(provider, config = null) {
        switch (provider) {
            case 'openai': return await openAIService.testConnection(config);
            case 'gemini': return await geminiService.testConnection(config);
            case 'claude': return await claudeService.testConnection(config);
            default: return { success: false, error: 'Unknown provider' };
        }
    }
}

export default new UnifiedAIService();
