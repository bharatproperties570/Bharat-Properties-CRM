/**
 * AIDataPolicy.js
 * Centralized PII Minimization and Data Classification Abstraction
 */

class AIDataPolicy {
    // Known fields that must NEVER be sent to AI providers
    static NEVER_SEND_KEYS = [
        'password', 'token', 'session', 'apiKey', 'api_key', 
        'secret', 'transactionId', 'paymentId', 'creditCard',
        'unitNumber', 'plotNumber'
    ];

    // Fields that should be masked/redacted
    static MASK_KEYS = ['firstName', 'lastName', 'phone', 'email', 'mobile'];

    /**
     * Sanitizes a single object (e.g., a Lead or Deal).
     * @param {Object} data - The raw MongoDB or JS object
     * @returns {Object} - A deeply cloned, sanitized object
     */
    static sanitizeObject(data) {
        if (!data || typeof data !== 'object') return data;
        
        // Deep clone to prevent mutations
        const clone = JSON.parse(JSON.stringify(data));
        return this._recursiveSanitize(clone);
    }

    static _recursiveSanitize(obj) {
        if (Array.isArray(obj)) {
            return obj.map(item => this._recursiveSanitize(item));
        }

        if (obj !== null && typeof obj === 'object') {
            for (const key in obj) {
                const lowerKey = key.toLowerCase();

                // 1. NEVER SEND
                if (this.NEVER_SEND_KEYS.some(k => lowerKey.includes(k.toLowerCase()))) {
                    delete obj[key];
                    continue;
                }

                // 2. MASK
                if (this.MASK_KEYS.some(k => lowerKey === k.toLowerCase())) {
                    if (lowerKey.includes('phone') || lowerKey.includes('mobile')) {
                        obj[key] = '[REDACTED_PHONE]';
                    } else if (lowerKey.includes('email')) {
                        obj[key] = '[REDACTED_EMAIL]';
                    } else if (lowerKey.includes('name')) {
                        obj[key] = '[CLIENT_NAME]';
                    } else {
                        obj[key] = '[MASKED]';
                    }
                    continue;
                }

                // 3. RECURSE
                if (typeof obj[key] === 'object') {
                    obj[key] = this._recursiveSanitize(obj[key]);
                } else if (typeof obj[key] === 'string') {
                    // 4. BUSINESS-SENSITIVE STRING SCRUBBING (Notes, Descriptions)
                    // If a field wasn't caught by key, scrub it for errant PII (regex fallback)
                    obj[key] = this.sanitizeText(obj[key]);
                }
            }
        }
        return obj;
    }

    /**
     * Sanitizes raw text (e.g. OCR PDF output, CRM notes).
     * Replaces phone numbers and emails with placeholders.
     * @param {string} text - Raw untrusted text
     * @returns {string} - Scrubbed text
     */
    static sanitizeText(text) {
        if (typeof text !== 'string') return text;
        
        let sanitized = text;

        // Mask phone numbers (basic Indian/Intl regex + general 10 digits)
        const phoneRegex = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g;
        sanitized = sanitized.replace(phoneRegex, (match) => {
            // Only mask if it's actually 7+ digits long (avoids masking small numbers)
            const digits = match.replace(/\D/g, '');
            if (digits.length >= 7) return '[REDACTED_PHONE]';
            return match;
        });

        // Mask emails
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
        sanitized = sanitized.replace(emailRegex, '[REDACTED_EMAIL]');

        return sanitized;
    }
}

export default AIDataPolicy;
