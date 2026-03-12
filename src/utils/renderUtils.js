/**
 * Safely renders a value, handling nulls, undefineds, and objects.
 * Useful for fields populated from lookup tables or nested objects.
 * @param {any} val - The value to render
 * @returns {string|number|React.ReactNode} - The safely rendered value
 */
export const renderValue = (val, emptyValue = '-', prefix = '') => {
    if (val === null || val === undefined || val === '') return emptyValue;
    let result = val;
    if (typeof val === 'object') {
        result = val.lookup_value || val.fullName || val.name || val.label || val.value || val.displayName;
    }
    if (result === null || result === undefined || result === '') return emptyValue;
    return prefix ? `${prefix}${result}` : result;
};
