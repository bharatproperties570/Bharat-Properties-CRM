/**
 * Safely renders a value, handling nulls, undefineds, and objects.
 * Useful for fields populated from lookup tables or nested objects.
 * @param {any} val - The value to render
 * @returns {string|number|React.ReactNode} - The safely rendered value
 */
export const renderValue = (val, emptyValue = '-', prefix = '') => {
    if (val === null || val === undefined || val === '') return emptyValue;
    
    // If it's an array, render it as a comma-separated string
    if (Array.isArray(val)) {
        if (val.length === 0) return emptyValue;
        return val.map(item => renderValue(item, '', '')).filter(Boolean).join(', ') || emptyValue;
    }

    let result = val;
    // If it's a non-primitive object, try to extract a string value
    if (typeof val === 'object') {
        const extracted = val.lookup_value || val.fullName || val.name || val.title || val.label || val.value || val.displayName || val.code;

        // A. Handle Measurement Objects { value, unit }
        if (extracted === undefined && val.value !== undefined && val.unit !== undefined) {
             return `${val.value} ${val.unit}`;
        }

        // B. Handle Property Config Objects { _id, name } or { id, name }
        if (extracted === undefined && val.name && (val._id || val.id)) {
            return val.name;
        }

        if (extracted !== undefined && extracted !== null && typeof extracted !== 'object') {
            result = extracted;
        } else {
            // Final fallback: string representation if safe, else empty string
            try {
                const str = String(val);
                result = (str !== '[object Object]') ? str : '';
            } catch (e) {
                result = '';
            }
        }
    }
    
    if (result === null || result === undefined || result === '') return emptyValue;
    
    // FINAL SAFETY: Handle plain objects and MongoDB IDs
    if (typeof result === 'object' || (typeof result === 'string' && /^[0-9a-fA-F]{24}$/.test(result))) {
        try {
            const str = String(result);
            if (str === '[object Object]') return emptyValue;
            
            // PROFESSIONAL FIX: Never show truncated IDs as values to the user
            if (/^[0-9a-fA-F]{24}$/.test(str)) {
                return emptyValue; 
            }
            return str;
        } catch (e) {
            return emptyValue;
        }
    }

    const finalResult = prefix ? `${prefix}${result}` : result;
    
    // ABSOLUTE SAFETY: If we are still returning an object, stringify it or return empty
    if (typeof finalResult === 'object' && finalResult !== null) {
        try {
            const str = String(finalResult);
            return str === '[object Object]' ? emptyValue : str;
        } catch (e) {
            return emptyValue;
        }
    }

    return finalResult;
};

/**
 * Safely formats a date, catching any RangeError or parsing exceptions.
 * @param {any} dateVal - The date value to format
 * @param {object} options - Format options
 * @param {string} emptyValue - Fallback value
 * @returns {string}
 */
export const formatSafeDate = (dateVal, options = {}, emptyValue = '-') => {
    if (dateVal === null || dateVal === undefined || dateVal === '') return emptyValue;
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return emptyValue;
        return d.toLocaleDateString('en-IN', options);
    } catch (e) {
        return emptyValue;
    }
};

/**
 * Safely formats a date and time, catching any RangeError or parsing exceptions.
 * @param {any} dateVal - The date/time value to format
 * @param {object} options - Format options
 * @param {string} emptyValue - Fallback value
 * @returns {string}
 */
export const formatSafeDateTime = (dateVal, options = {}, emptyValue = '-') => {
    if (dateVal === null || dateVal === undefined || dateVal === '') return emptyValue;
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return emptyValue;
        return d.toLocaleString([], options);
    } catch (e) {
        return emptyValue;
    }
};

