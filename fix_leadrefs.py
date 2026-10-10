import re

with open('src/utils/crmHooks.js', 'r') as f:
    content = f.read()

# Remove the bad import
content = content.replace("import { normalizeLeadRefs } from './helpers';", "")

normalize_func = """
// Normalizes references to IDs only to prevent 500/400 backend schema validation errors
const normalizeLeadRefs = (obj, parentKey = null) => {
    if (!obj || typeof obj !== 'object') return obj;
    const result = Array.isArray(obj) ? [...obj] : { ...obj };

    // Fields that should REMAIN as objects (not converted to IDs)
    const embeddedFields = ["phones", "emails", "personalAddress", "correspondenceAddress", "educations", "loans", "socialMedia", "incomes", "documents"];

    if (Array.isArray(result)) {
        if (embeddedFields.includes(parentKey)) {
            return result.map(item => normalizeLeadRefs(item));
        }
        return result.map(item => {
            if (typeof item === 'object' && item !== null) {
                if (item._id) return item._id;
                if (item.id) return item.id;
            }
            return item;
        });
    }

    for (const key in result) {
        if (embeddedFields.includes(key)) {
            if (Array.isArray(result[key])) {
                result[key] = result[key].map(item => normalizeLeadRefs(item, key));
            } else {
                result[key] = normalizeLeadRefs(result[key], key);
            }
        } else if (result[key] && typeof result[key] === 'object') {
            if (Array.isArray(result[key])) {
                result[key] = result[key].map(item => {
                    if (typeof item === 'object' && item !== null) {
                        return item._id || item.id || item;
                    }
                    return item;
                });
            } else {
                result[key] = result[key]._id || result[key].id || normalizeLeadRefs(result[key], key);
            }
        }
    }
    return result;
};
"""

# Append it below mergeWithDefaults
content = content.replace('return merged;\n}\n', 'return merged;\n}\n' + normalize_func)

with open('src/utils/crmHooks.js', 'w') as f:
    f.write(content)
