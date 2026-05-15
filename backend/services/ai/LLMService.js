/**
 * LLM Service wrapper for structured data extraction.
 * Useful as a fallback when regex-based parsing fails to find core fields.
 */
import fetch from 'node-fetch'; // Requires node-fetch if Node < 18, but Node 24 is used here so global fetch is ok. But we'll just use global.

class LLMService {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
        this.provider = process.env.OPENAI_API_KEY ? 'openai' : (process.env.GEMINI_API_KEY ? 'gemini' : null);
    }

    /**
     * Extracts structured property data from unstructured text using an LLM.
     * @param {string} text - The raw text message or OCR output.
     * @returns {Promise<Object>} The structured fields (price, size, location, etc.)
     */
    async extractPropertyData(text) {
        if (!this.provider) {
            console.warn('[LLMService] No API key configured. Skipping LLM Fallback extraction.');
            return null; // Fallback to null so parser returns whatever it got via regex
        }

        const prompt = `
        Extract the following Indian real estate fields from the text below. 
        Return ONLY a raw JSON object (no markdown formatting or backticks).
        Required keys: price (string), size (string), location (string), intent (BUYER/SELLER/TENANT/LANDLORD), property_type (string).
        If a field is missing, set its value to null.
        
        Text: "${text}"
        `;

        try {
            if (this.provider === 'openai') {
                return await this._callOpenAI(prompt);
            } else if (this.provider === 'gemini') {
                return await this._callGemini(prompt);
            }
        } catch (error) {
            console.error('[LLMService] Extraction failed:', error.message);
            return null;
        }
    }

    async _callOpenAI(prompt) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) throw new Error('OpenAI API Error');
        const data = await response.json();
        const content = data.choices[0].message.content;
        return JSON.parse(content);
    }

    async _callGemini(prompt) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!response.ok) throw new Error('Gemini API Error');
        const data = await response.json();
        const content = data.candidates[0].content.parts[0].text;
        return JSON.parse(content);
    }
}

export default new LLMService();
