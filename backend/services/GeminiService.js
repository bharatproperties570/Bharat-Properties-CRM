import axios from 'axios';
import SystemSetting from '../models/SystemSetting.js';

/**
 * GeminiService.js
 * Phase D: Real Google Gemini 1.5 Pro integration via Google AI Studio.
 *
 * Priority order for credentials:
 *   1. GOOGLE_AI_API_KEY env var
 *   2. GEMINI_API_KEY env var
 *   3. SystemSetting DB key 'ai_gemini_config'
 */
class GeminiService {
    /**
     * Get Gemini configuration — env vars take priority over DB settings.
     */
    async _getConfig() {
        // 1. Env vars first (fastest, no DB round-trip)
        const envKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
        if (envKey && !envKey.includes('YOUR_')) {
            return {
                apiKey:     envKey,
                model:      'gemini-1.5-pro',
                apiVersion: 'v1beta',  // v1beta required for systemInstruction support
            };
        }

        // 2. Fall back to DB-stored config
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
            // Always use v1beta: it supports systemInstruction and is the current stable API
            const apiVersion = config.apiVersion || 'v1beta';

            if (!apiKey) throw new Error('Gemini API Key is missing');

            const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
            console.log(`[GeminiService] Testing with ${apiVersion}/${model}`);

            const response = await axios.post(url, {
                contents: [{ parts: [{ text: 'Test: reply "OK"' }] }]
            }, { headers: { 'Content-Type': 'application/json' } });

            if (response.data?.candidates) {
                return { success: true, message: `✅ Gemini API (${apiVersion}/${model}) is active!` };
            }
            throw new Error('Empty candidates in Gemini response');
        } catch (err) {
            const errorMsg = err.response?.data?.error?.message || err.message;
            console.error('[GeminiService] testConnection error:', errorMsg);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Generate content using Gemini (user prompt only)
     * @param {string} prompt
     * @param {Object} opts - { model, temperature, maxTokens }
     */
    async generateContent(prompt, opts = {}) {
        const config = await this._getConfig();
        const apiKey = config.apiKey;
        if (!apiKey || apiKey.includes('YOUR_')) {
            throw new Error('Gemini API Key not configured. Add GOOGLE_AI_API_KEY to .env or Settings > Integrations.');
        }
        const model      = opts.model || config.model || 'gemini-1.5-pro';
        const apiVersion = config.apiVersion || 'v1beta';

        return this._callGemini(apiKey, apiVersion, model, null, prompt, opts);
    }

    /**
     * Generate content with a system instruction (for Metrics Agent persona injection).
     * Uses Gemini's native `systemInstruction` field — available since v1beta.
     *
     * @param {string} systemPrompt  - Agent persona / system instruction
     * @param {string} userPrompt    - The actual user task
     * @param {Object} opts          - { model, temperature, maxTokens }
     */
    async generateWithSystem(systemPrompt, userPrompt, opts = {}) {
        const config = await this._getConfig();
        const apiKey = config.apiKey;
        if (!apiKey || apiKey.includes('YOUR_')) {
            throw new Error('Gemini API Key not configured. Add GOOGLE_AI_API_KEY to .env or Settings > Integrations.');
        }
        const model      = opts.model || config.model || 'gemini-1.5-pro';
        const apiVersion = 'v1beta'; // systemInstruction only available in v1beta

        return this._callGemini(apiKey, apiVersion, model, systemPrompt, userPrompt, opts);
    }

    /**
     * Internal Gemini API caller.
     */
    async _callGemini(apiKey, apiVersion, model, systemPrompt, userPrompt, opts = {}) {
        const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;

        const body = {
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
                temperature:     opts.temperature ?? 0.7,
                maxOutputTokens: opts.maxTokens   ?? 2048,
            },
        };

        // Inject system instruction if provided (v1beta feature)
        if (systemPrompt) {
            body.systemInstruction = { parts: [{ text: systemPrompt }] };
        }

        try {
            const response = await axios.post(url, body, {
                headers:  { 'Content-Type': 'application/json' },
                timeout:  30000,
            });

            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Empty response from Gemini');

            const usage = response.data?.usageMetadata || {};
            console.log(`[GeminiService] ✅ Generated ${text.length} chars. Tokens: in=${usage.promptTokenCount} out=${usage.candidatesTokenCount}`);
            return text;
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            console.error(`[GeminiService] _callGemini error (${model}):`, detail);
            throw new Error(`Gemini error: ${detail}`);
        }
    }
}

export default new GeminiService();
