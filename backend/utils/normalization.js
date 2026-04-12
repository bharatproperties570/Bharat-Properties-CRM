/**
 * normalization.js
 * Universal normalization helpers for CRM data consistency.
 */

/**
 * Normalizes a phone number to a standard 10-digit format for Indian local matching.
 * Handles: +91, 91, 0 prefixes, spaces, hyphens, and parentheses.
 * 
 * @param {string|number} phone - The raw phone number input
 * @returns {string} - Cleaned 10-digit phone number
 */
export const normalizePhone = (phone) => {
    if (!phone) return '';
    
    // 1. Convert to string and remove all non-numeric characters
    let cleaned = String(phone).replace(/\D/g, '');
    
    // 2. Handle Indian country code (91) if it's 12 digits starting with 91
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        cleaned = cleaned.substring(2);
    }
    
    // 3. Handle leading zero if it's 11 digits starting with 0
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }
    
    // 4. Final safety: If it's longer than 10, take the last 10 digits
    // This handles cases like +91 999 100 0570 where spaces might cause length issues
    if (cleaned.length > 10) {
        cleaned = cleaned.slice(-10);
    }
    
    return cleaned;
};
