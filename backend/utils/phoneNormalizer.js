/**
 * phoneNormalizer.js — Universal Phone Normalization & Matching Utility
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise CRM Phase 6.1 Core Utility.
 * Consolidates all phone normalization, E.164 formatting, India mobile validation,
 * and multi-format lookup key generation across all controllers and services.
 *
 * Preserves exact WhatsApp LID, Indian gateway 10-digit compatibility,
 * and JID preservation contracts.
 */

/**
 * Normalizes a phone number to standard 10-digit format for Indian local matching.
 * Handles: +91, 91, 0 prefixes, spaces, hyphens, and parentheses.
 * Preserves WhatsApp group JIDs (@g.us), user JIDs (@s.whatsapp.net), and WhatsApp LIDs (@lid).
 *
 * @param {string|number} phone - Raw input phone number
 * @returns {string} - Cleaned 10-digit phone number or raw JID/LID string
 */
export function normalizePhone(phone) {
    if (!phone) return '';
    const phoneStr = String(phone).trim();
    if (phoneStr.includes('@g.us') || phoneStr.includes('@s.whatsapp.net') || phoneStr.includes('@lid')) {
        return phoneStr;
    }

    // Clean all non-numeric characters
    let cleaned = phoneStr.replace(/\D/g, '');

    // For Indian gateways, 10 digits is required for Transactional routes
    // If 12 digits starting with 91, strip the 91
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        return cleaned.substring(2);
    }

    // If 11 digits starting with 0, strip the 0
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
        return cleaned.substring(1);
    }

    // If already exactly 10 digits, return it
    if (cleaned.length === 10) {
        return cleaned;
    }

    // 🔒 WhatsApp LID Protection: Linked IDs are 14+ digit integers
    // Never slice an LID down to 10 digits, otherwise it creates a fake non-existent Indian phone
    if (cleaned.length >= 13) {
        return cleaned;
    }

    // Final fallback: take last 10 digits
    if (cleaned.length > 10) {
        return cleaned.slice(-10);
    }

    return cleaned;
}

/**
 * Formats a phone number into canonical E.164 format (+919876543210).
 * Defaults to Indian country code '91' if none provided.
 *
 * @param {string|number} phone - Raw phone input
 * @param {string} [defaultCountryCode='91'] - Country code without '+'
 * @returns {string} - E.164 formatted string or empty if invalid
 */
export function normalizePhoneE164(phone, defaultCountryCode = '91') {
    if (!phone) return '';
    const phoneStr = String(phone).trim();
    if (phoneStr.includes('@')) return phoneStr;

    const digits = phoneStr.replace(/\D/g, '');
    if (!digits) return '';

    // Already has country code
    if (digits.length === 12 && digits.startsWith('91')) {
        return `+${digits}`;
    }

    // 10-digit Indian phone
    if (digits.length === 10) {
        return `+${defaultCountryCode}${digits}`;
    }

    // 11-digit with leading 0
    if (digits.length === 11 && digits.startsWith('0')) {
        return `+${defaultCountryCode}${digits.substring(1)}`;
    }

    if (phoneStr.startsWith('+')) {
        return `+${digits}`;
    }

    return `+${digits}`;
}

/**
 * Generates an array of phone variants for database lookup queries.
 * Standardizes the 3 variants used across Indian CRM matching:
 * ['9876543210', '+919876543210', '919876543210']
 *
 * @param {string|number} phone - Phone input
 * @returns {string[]} - Array of matching keys (empty if invalid phone)
 */
export function getPhoneLookupVariants(phone) {
    if (!phone) return [];
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.includes('@') || normalized.length < 10) {
        return normalized ? [normalized] : [];
    }

    const last10 = normalized.slice(-10);
    return [
        last10,
        `+91${last10}`,
        `91${last10}`
    ];
}

/**
 * Validates whether a phone number is a valid Indian mobile number.
 * Valid numbers are 10 digits starting with 6, 7, 8, or 9.
 *
 * @param {string|number} phone - Phone input
 * @returns {boolean} - True if valid Indian mobile
 */
export function isValidIndianMobile(phone) {
    if (!phone) return false;
    const normalized = normalizePhone(phone);
    if (normalized.length !== 10) return false;
    return /^[6-9]\d{9}$/.test(normalized);
}

export default {
    normalizePhone,
    normalizePhoneE164,
    getPhoneLookupVariants,
    isValidIndianMobile
};
