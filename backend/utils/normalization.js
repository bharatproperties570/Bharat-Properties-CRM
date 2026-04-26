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
    
    // Clean all non-numeric
    let cleaned = String(phone).replace(/\D/g, '');
    
    // For Indian gateways, 10 digits is often safer for Transactional routes
    // If it's 12 digits starting with 91, strip the 91
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        return cleaned.substring(2);
    }
    
    // If it starts with 0 and is 11 digits, strip the 0
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
        return cleaned.substring(1);
    }
    
    // If it's already 10 digits, return it
    if (cleaned.length === 10) {
        return cleaned;
    }
    
    // Final fallback: take last 10 digits
    if (cleaned.length > 10) {
        return cleaned.slice(-10);
    }
    
    return cleaned;
};
