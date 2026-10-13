/**
 * Utility for sanitizing PII (Personally Identifiable Information)
 * before logging to operational systems like BullMQ.
 */

export const maskPhone = (phone) => {
    if (!phone) return 'N/A';
    const str = String(phone);
    if (str.length <= 4) return '***';
    return '*'.repeat(str.length - 4) + str.slice(-4);
};

export const maskEmail = (email) => {
    if (!email) return 'N/A';
    const str = String(email);
    const [localPart, domain] = str.split('@');
    if (!domain) return maskName(str); // Malformed email
    const maskedLocal = localPart.length > 2 
        ? localPart.charAt(0) + '*'.repeat(localPart.length - 2) + localPart.charAt(localPart.length - 1)
        : '*'.repeat(localPart.length);
    return `${maskedLocal}@${domain}`;
};

export const maskName = (name) => {
    if (!name) return 'Unknown';
    const parts = String(name).split(' ');
    return parts.map(part => {
        if (part.length <= 1) return part;
        return part.charAt(0) + '*'.repeat(part.length - 1);
    }).join(' ');
};

export const sanitizeError = (errMsg) => {
    if (!errMsg) return 'Unknown Error';
    let str = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
    
    // Mask phones: sequences of 7 to 15 digits
    str = str.replace(/\b\d{7,15}\b/g, (match) => maskPhone(match));
    
    // Mask emails
    str = str.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi, (match) => maskEmail(match));
    
    return str;
};

export default { maskPhone, maskEmail, maskName, sanitizeError };
