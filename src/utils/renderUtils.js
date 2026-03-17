/**
 * Safely renders a value, handling nulls, undefineds, and objects.
 * Useful for fields populated from lookup tables or nested objects.
 * @param {any} val - The value to render
 * @returns {string|number|React.ReactNode} - The safely rendered value
 */
export const renderValue = (val, emptyValue = '-', prefix = '') => {
    if (val === null || val === undefined || val === '') return emptyValue;
    let result = val;
    // If it's a non-primitive object, try to extract a string value
    if (typeof val === 'object') {
        const extracted = val.lookup_value || val.fullName || val.name || val.title || val.label || val.value || val.displayName;
        if (extracted && typeof extracted !== 'object') {
            result = extracted;
        } else {
            // Final fallback: string representation if safe, else empty string
            result = typeof val.toString === 'function' && val.toString() !== '[object Object]' ? val.toString() : '';
        }
    }
    
    if (result === null || result === undefined || result === '') return emptyValue;
    return prefix ? `${prefix}${result}` : result;
};
