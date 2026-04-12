import openAIService from './OpenAIService.js';
import geminiService from './GeminiService.js';
import claudeService from './ClaudeService.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * UnifiedAIService.js
 * Phase D: A provider-agnostic AI wrapper with automatic failover capabilities.
 * Supports native systemInstruction (Gemini) and system role (OpenAI).
 */
class UnifiedAIService {
    /**
     * Get preferred AI provider from system settings
     */
    async _getPreferredProvider() {
        const setting = await SystemSetting.findOne({ key: 'ai_preferred_provider' });
        return setting?.value || 'google'; // Default to Google/Gemini
    }

    /**
     * Unified generate method with fallback support.
     * @param {string} prompt 
     * @param {Object} options - { provider, temperature, maxTokens, systemPrompt }
     */
    async generate(prompt, options = {}) {
        const preferred = options.provider || await this._getPreferredProvider();
        const providers = [preferred, 'openai', 'gemini', 'claude'].filter((v, i, a) => a.indexOf(v) === i);

        let lastError = null;

        for (const provider of providers) {
            try {
                console.log(`[UnifiedAI] Attempting ${options.systemPrompt ? 'System' : 'Standard'} generation with: ${provider}`);
                
                if (options.systemPrompt) {
                    // ── Generate with System Prompt (Persona Injection) ──
                    switch (provider) {
                        case 'openai':
                            return await openAIService.generateWithSystem(options.systemPrompt, prompt, options);
                        case 'gemini':
                        case 'google':
                            return await geminiService.generateWithSystem(options.systemPrompt, prompt, options);
                        default:
                            continue;
                    }
                } else {
                    // ── Standard Generation (User Prompt Only) ──
                    switch (provider) {
                        case 'openai':
                            return await openAIService.generateContent(prompt, options);
                        case 'gemini':
                        case 'google':
                            return await geminiService.generateContent(prompt, options);
                        case 'claude':
                            return await claudeService.generateContent(prompt, options);
                        default:
                            continue;
                    }
                }
            } catch (err) {
                console.warn(`[UnifiedAI] ${provider} failed:`, err.message);
                lastError = err;
                // Move to next provider in failover chain
            }
        }

        throw new Error(`UnifiedAI failed. All configured providers (${providers.join(', ')}) were exhausted. Last error: ${lastError?.message}`);
    }

    /**
     * Test connection for a specific provider
     */
    async testProvider(provider, config = null) {
        switch (provider) {
            case 'openai': return await openAIService.testConnection(config);
            case 'gemini':
            case 'google': return await geminiService.testConnection(config);
            case 'claude': return await claudeService.testConnection(config);
            default: return { success: false, error: 'Unknown provider' };
        }
    }
}

export default new UnifiedAIService();

