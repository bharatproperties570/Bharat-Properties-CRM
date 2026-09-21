import mongoose from 'mongoose';

/**
 * Escapes special characters for regex matching.
 */
function escapeRegExp(string) {
    if (!string) return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

class LookupService {
    /**
     * Resolves a flat lookup (e.g., Lead Source, Status, Stage).
     * Preserves exact duplicate/race condition behavior and error bubbling from original implementation.
     *
     * @param {string} type - lookup_type
     * @param {string} value - lookup_value
     * @param {object} options - Configuration options
     * @param {boolean} [options.createIfMissing=true] - Whether to create if not found
     * @param {boolean} [options.checkAliases=false] - Whether to also search metadata.aliases
     * @param {mongoose.ClientSession|null} [options.session=null] - Optional MongoDB session
     * @returns {Promise<mongoose.Types.ObjectId|null>}
     */
    static async resolve(type, value, options = {}) {
        if (!value) return null;

        // Valid 24-char ObjectId passthrough
        if (mongoose.Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(String(value))) {
            return new mongoose.Types.ObjectId(value.toString());
        }

        const { createIfMissing = true, checkAliases = false, session = null } = options;
        const Lookup = mongoose.model('Lookup');

        const escapedValue = escapeRegExp(value);
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

        let lookup = await Lookup.findOne(query).session(session);

        if (!lookup) {
            if (!createIfMissing) return null;

            // Explicitly preserves findOne->create race condition logic for behavior parity.
            const createPayload = [{ lookup_type: type, lookup_value: value }];
            const createdDocs = await Lookup.create(createPayload, { session });
            lookup = Array.isArray(createdDocs) ? createdDocs[0] : createdDocs;
        }

        return lookup._id;
    }

    /**
     * Resolves a hierarchical lookup with an explicitly defined parent.
     *
     * @param {string} type - lookup_type
     * @param {string} value - lookup_value
     * @param {mongoose.Types.ObjectId} parentId - parent_lookup_id
     * @param {object} options - Configuration options
     * @param {boolean} [options.createIfMissing=true] - Whether to create if not found
     * @param {string|null} [options.parentValue=null] - Optional parent string value (used by AddressParsing)
     * @param {mongoose.ClientSession|null} [options.session=null] - Optional MongoDB session
     * @returns {Promise<mongoose.Types.ObjectId|null>}
     */
    static async resolveWithParent(type, value, parentId, options = {}) {
        if (!value) return null;

        if (mongoose.Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(String(value))) {
            return new mongoose.Types.ObjectId(value.toString());
        }

        const { createIfMissing = true, parentValue = null, session = null } = options;
        const Lookup = mongoose.model('Lookup');

        const trimmedValue = value.trim();
        const escapedValue = escapeRegExp(trimmedValue);

        const query = {
            lookup_type: type,
            lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') }
        };

        if (parentId) query.parent_lookup_id = parentId;

        let lookup = await Lookup.findOne(query).session(session);

        if (!lookup) {
            if (!createIfMissing) return null;

            const createData = { lookup_type: type, lookup_value: trimmedValue };
            if (parentId) createData.parent_lookup_id = parentId;
            if (parentValue) createData.parent_lookup_value = parentValue;

            const createdDocs = await Lookup.create([createData], { session });
            lookup = Array.isArray(createdDocs) ? createdDocs[0] : createdDocs;
        }

        return lookup._id;
    }
}

export default LookupService;
