/**
 * Safely renders a value, handling nulls, undefineds, and objects.
 * Useful for fields populated from lookup tables or nested objects.
 * @param {any} val - The value to render
 * @returns {string|number|React.ReactNode} - The safely rendered value
 */
export const renderValue = (val) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') {
        return val.lookup_value || val.name || val.label || val.value || val.displayName || '-';
    }
    return val;
};
