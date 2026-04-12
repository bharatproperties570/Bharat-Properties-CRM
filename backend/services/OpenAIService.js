import axios from 'axios';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * OpenAIService.js
 * Phase D: Real OpenAI GPT-4o integration for the Social Agent.
 *
 * Priority order for credentials:
 *   1. OPENAI_API_KEY env var
 *   2. SystemSetting DB key 'ai_openai_config'
 */
class OpenAIService {
    /**
     * Get OpenAI configuration — env var takes priority over DB settings.
     */
    async _getConfig() {
        // 1. Env var first
        const envKey = process.env.OPENAI_API_KEY;
        if (envKey && !envKey.includes('YOUR_')) {
            return { apiKey: envKey, model: 'gpt-4o' };
        }

        // 2. Fall back to DB-stored config
        const config = await SystemSetting.findOne({ key: 'ai_openai_config' });
        return config?.value || {};
    }

    /**
     * Test an OpenAI API connection.
     * @param {Object} manualConfig - Optional manual config to test before saving
     */
    async testConnection(manualConfig = null) {
        try {
            const config = manualConfig || await this._getConfig();
            const apiKey = config.apiKey;
            const model  = config.model || 'gpt-4o';

            if (!apiKey) throw new Error('OpenAI API Key is missing');

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model,
                    messages: [{ role: 'user', content: 'Test: reply "OK"' }],
                    max_tokens: 5,
                },
                {
                    headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    timeout: 15000,
                }
            );

            if (response.data?.choices) {
                return { success: true, message: `✅ OpenAI API (${model}) is active and responding!` };
            }
            throw new Error('Invalid response from OpenAI API');
        } catch (err) {
            const errMsg = err.response?.data?.error?.message || err.message;
            console.error('[OpenAIService] testConnection error:', errMsg);
            return { success: false, error: errMsg };
        }
    }

    /**
     * Generate content using OpenAI (user prompt only).
     * @param {string} prompt
     * @param {Object} opts - { model, temperature, maxTokens }
     */
    async generateContent(prompt, opts = {}) {
        const config = await this._getConfig();
        const apiKey = config.apiKey;
        if (!apiKey || apiKey.includes('YOUR_')) {
            throw new Error('OpenAI API Key not configured. Add OPENAI_API_KEY to .env or Settings > Integrations.');
        }
        const model = opts.model || config.model || 'gpt-4o';

        return this._callOpenAI(apiKey, model, null, prompt, opts);
    }

    /**
     * Generate content with a system prompt (for Social Agent persona injection).
     * Uses OpenAI Chat Completions with a `system` role message.
     *
     * @param {string} systemPrompt  - Agent persona / system instruction
     * @param {string} userPrompt    - The actual user task
     * @param {Object} opts          - { model, temperature, maxTokens }
     */
    async generateWithSystem(systemPrompt, userPrompt, opts = {}) {
        const config = await this._getConfig();
        const apiKey = config.apiKey;
        if (!apiKey || apiKey.includes('YOUR_')) {
            throw new Error('OpenAI API Key not configured. Add OPENAI_API_KEY to .env or Settings > Integrations.');
        }
        const model = opts.model || config.model || 'gpt-4o';

        return this._callOpenAI(apiKey, model, systemPrompt, userPrompt, opts);
    }

    /**
     * Internal OpenAI API caller.
     * Returns the text content string.
     */
    async _callOpenAI(apiKey, model, systemPrompt, userPrompt, opts = {}) {
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userPrompt });

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model,
                    messages,
                    temperature: opts.temperature ?? 0.7,
                    max_tokens:  opts.maxTokens   ?? 2048,
                },
                {
                    headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    timeout: 30000,
                }
            );

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) throw new Error('Empty response from OpenAI');

            const usage = response.data?.usage || {};
            console.log(`[OpenAIService] ✅ Generated ${content.length} chars. Tokens: in=${usage.prompt_tokens} out=${usage.completion_tokens} total=${usage.total_tokens}`);
            return content;
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            console.error(`[OpenAIService] _callOpenAI error (${model}):`, detail);
            throw new Error(`OpenAI error: ${detail}`);
        }
    }
}

export default new OpenAIService();

