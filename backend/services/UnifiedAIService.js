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
        console.log(`[UnifiedAI_AUDIT] Request Received. Options: ${JSON.stringify(options)}`);
        const preferred = options.provider || await this._getPreferredProvider();
        const providers = [preferred, 'openai', 'gemini', 'claude'].filter((v, i, a) => a.indexOf(v) === i);

        let lastError = null;

        for (const provider of providers) {
            try {
                console.log(`[UnifiedAI] Attempting ${options.systemPrompt ? 'System' : 'Standard'} generation with: ${provider}`);
                
                // 🛠️ SENIOR FIX: If we are falling back to a provider that is NOT the preferred one,
                // we should NOT force the model name from options, as it's likely specific to the preferred provider.
                const currentOptions = { ...options };
                if (provider !== preferred && currentOptions.model) {
                    console.log(`[UnifiedAI] Failover detected. Stripping incompatible model '${currentOptions.model}' for provider '${provider}'`);
                    delete currentOptions.model;
                }

                if (options.systemPrompt) {
                    // ── Generate with System Prompt (Persona Injection) ──
                    switch (provider) {
                        case 'openai':
                            return await openAIService.generateWithSystem(options.systemPrompt, prompt, currentOptions);
                        case 'gemini':
                        case 'google':
                            return await geminiService.generateWithSystem(options.systemPrompt, prompt, currentOptions);
                        case 'anthropic':
                        case 'claude':
                            return await claudeService.generateWithSystem(options.systemPrompt, prompt, currentOptions);
                        default:
                            continue;
                    }
                } else {
                    // ── Standard Generation (User Prompt Only) ──
                    switch (provider) {
                        case 'openai':
                            return await openAIService.generateContent(prompt, currentOptions);
                        case 'gemini':
                        case 'google':
                            return await geminiService.generateContent(prompt, currentOptions);
                        case 'anthropic':
                        case 'claude':
                            return await claudeService.generateContent(prompt, currentOptions);
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
            case 'anthropic':
            case 'claude': return await claudeService.testConnection(config);
            default: return { success: false, error: 'Unknown provider' };
        }
    }
}

export default new UnifiedAIService();

