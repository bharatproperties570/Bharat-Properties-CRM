/**
 * normalization.js
 * Universal normalization helpers for CRM data consistency.
 * Consolidates to backend/utils/phoneNormalizer.js (Sprint 6.1).
 */

export { 
    normalizePhone, 
    normalizePhoneE164, 
    getPhoneLookupVariants, 
    isValidIndianMobile 
} from './phoneNormalizer.js';
