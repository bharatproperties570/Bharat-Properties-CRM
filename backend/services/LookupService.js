import mongoose from 'mongoose';

/**
 * Escapes special characters for regex matching.
 */
function escapeRegExp(string) {
    if (!string) return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const LOOKUP_CACHE = new Map();
const LOOKUP_CACHE_MAX = 500;

class LookupService {
    /**
     * Resolves a flat lookup (e.g., Lead Source, Status, Stage, Category, etc.).
     * Preserves exact duplicate/race condition behavior and error bubbling from original implementation.
     *
     * @param {string} type - lookup_type
     * @param {string|object} value - lookup_value or populated object
     * @param {object} options - Configuration options
     * @param {boolean} [options.createIfMissing=true] - Whether to create if not found
     * @param {boolean} [options.checkAliases=true] - Whether to also search metadata.aliases
     * @param {mongoose.Types.ObjectId|string|null} [options.parentId=null] - Optional parent lookup ID
     * @param {mongoose.ClientSession|null} [options.session=null] - Optional MongoDB session
     * @param {boolean} [options.useCache=true] - Whether to consult in-memory resolution cache
     * @returns {Promise<mongoose.Types.ObjectId|null>}
     */
    static async resolve(type, value, options = {}) {
        if (!value) return null;

        // If populated lookup object passed
        if (typeof value === 'object' && value._id) {
            value = value._id;
        }

        // Valid 24-char ObjectId passthrough
        if (mongoose.Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(String(value))) {
            return new mongoose.Types.ObjectId(value.toString());
        }

        const {
            createIfMissing = true,
            checkAliases = true,
            parentId = null,
            parent_lookup_id = null,
            session = null,
            useCache = true
        } = options;

        const effectiveParentId = parentId || parent_lookup_id;
        const trimmedValue = String(value).trim();
        if (!trimmedValue) return null;

        const cacheKey = `${type}:${effectiveParentId || 'root'}:${trimmedValue.toLowerCase()}`;
        if (useCache && !session && LOOKUP_CACHE.has(cacheKey)) {
            return LOOKUP_CACHE.get(cacheKey);
        }

        const Lookup = mongoose.models.Lookup || mongoose.model('Lookup');
        const escapedValue = escapeRegExp(trimmedValue);
        const regexMatch = new RegExp(`^${escapedValue}$`, 'i');

        const query = { lookup_type: type };

        if (checkAliases) {
            query.$or = [
                { lookup_value: { $regex: regexMatch } },
                { "metadata.aliases": { $regex: regexMatch } }
            ];
        } else {
            query.lookup_value = { $regex: regexMatch };
        }

        if (effectiveParentId && mongoose.Types.ObjectId.isValid(effectiveParentId)) {
            query.parent_lookup_id = new mongoose.Types.ObjectId(effectiveParentId.toString());
        }

        let lookup = await Lookup.findOne(query).session(session);

        if (!lookup) {
            if (!createIfMissing) return null;

            const createData = {
                lookup_type: type,
                lookup_value: trimmedValue
            };

            if (effectiveParentId && mongoose.Types.ObjectId.isValid(effectiveParentId)) {
                createData.parent_lookup_id = new mongoose.Types.ObjectId(effectiveParentId.toString());
            }

            const createdDocs = await Lookup.create([createData], { session });
            lookup = Array.isArray(createdDocs) ? createdDocs[0] : createdDocs;
        }

        const resolvedId = lookup ? lookup._id : null;

        if (resolvedId && useCache && !session) {
            if (LOOKUP_CACHE.size >= LOOKUP_CACHE_MAX) {
                const firstKey = LOOKUP_CACHE.keys().next().value;
                LOOKUP_CACHE.delete(firstKey);
            }
            LOOKUP_CACHE.set(cacheKey, resolvedId);
        }

        return resolvedId;
    }

    /**
     * Resolves a hierarchical lookup with an explicitly defined parent.
     *
     * @param {string} type - lookup_type
     * @param {string} value - lookup_value
     * @param {mongoose.Types.ObjectId|string} parentId - parent_lookup_id
     * @param {object} options - Configuration options
     * @returns {Promise<mongoose.Types.ObjectId|null>}
     */
    static async resolveWithParent(type, value, parentId, options = {}) {
        return this.resolve(type, value, { ...options, parentId });
    }

    /**
     * Resolves an array of values into an array of lookup ObjectIds.
     *
     * @param {string} type - lookup_type
     * @param {Array<string>} values - Array of values
     * @param {object} options - Configuration options
     * @returns {Promise<Array<mongoose.Types.ObjectId>>}
     */
    static async resolveMany(type, values, options = {}) {
        if (!Array.isArray(values) || values.length === 0) return [];
        const resolved = [];
        for (const val of values) {
            const id = await this.resolve(type, val, options);
            if (id) resolved.push(id);
        }
        return resolved;
    }

    /**
     * Resolves a full address object hierarchically (Country -> State -> City -> Location).
     *
     * @param {object} addr - Raw address input
     * @param {object} options - Options
     * @returns {Promise<object|null>}
     */
    static async resolveHierarchicalAddress(addr, options = {}) {
        if (!addr) return null;
        const resolved = { ...addr };

        const countryName = addr.country || ((addr.state || addr.city) ? 'India' : null);
        const countryId = await this.resolve('Country', countryName, options);
        if (countryId) resolved.country = countryId;

        const stateId = await this.resolveWithParent('State', addr.state, countryId, options);
        if (stateId) resolved.state = stateId;

        const cityId = await this.resolveWithParent('City', addr.city, stateId, options);
        if (cityId) resolved.city = cityId;

        const locationVal = addr.location || addr.locality || addr.sector || addr.area;
        if (locationVal && locationVal.length <= 35) {
            const locationId = await this.resolveWithParent('Location', locationVal, cityId, options);
            if (locationId) {
                resolved.location = locationId;
                resolved.locality = locationId;
            }
        }

        return resolved;
    }

    /**
     * Clears internal memory cache (useful for test resets).
     */
    static clearCache() {
        LOOKUP_CACHE.clear();
    }
}

export default LookupService;
