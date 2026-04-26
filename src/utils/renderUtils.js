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
    
    // FINAL SAFETY: Never return a plain object to React
    if (typeof result === 'object') {
        try {
            const str = String(result);
            return (str !== '[object Object]') ? str : emptyValue;
        } catch (e) {
            return emptyValue;
        }
    }

    return prefix ? `${prefix}${result}` : result;
};
