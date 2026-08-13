export class VariableResolver {
    /**
     * Resolves variables in a template string using data from the context object.
     * Supports nested paths like `{{associatedContact.mobile}}` and fallback `{{nonExistent|Default}}`
     * 
     * @param {string} template - The template string, e.g., "Hi {{name}}, your meeting is on {{activity_date}}"
     * @param {Object} context - The data context, e.g., { name: 'John', activity_date: '2023-10-10' }
     * @returns {string} - The resolved string
     */
    static resolve(template, context) {
        if (!template || typeof template !== 'string') return template;
        
        return template.replace(/\{\{(.*?)\}\}/g, (match, expression) => {
            const [path, fallback = ''] = expression.split('|').map(s => s.trim());
            const value = this._getValueByPath(context, path);
            
            if (value === undefined || value === null || value === '') {
                return fallback;
            }
            
            // Format dates nicely if they look like an ISO string
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
                try {
                    return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                } catch (e) {
                    return value;
                }
            }
            
            if (value instanceof Date) {
                return value.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            }
            
            return String(value);
        });
    }

    static _getValueByPath(obj, path) {
        if (!obj || !path) return undefined;
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current === null || current === undefined) return undefined;
            current = current[key];
        }
        return current;
    }
}

export default VariableResolver;
