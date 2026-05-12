import mongoose from "mongoose";

const getLookupModel = () => mongoose.models.Lookup || mongoose.model('Lookup');

/**
 * Enterprise-Grade Lookup Resolver
 * Handles Find-or-Create with Hierarchical Support
 */
export const resolveLookup = async (type, value, parent_lookup_id = null) => {
    if (!value) return null;

    // Handle already valid ObjectId
    if (mongoose.Types.ObjectId.isValid(value)) {
        return new mongoose.Types.ObjectId(value.toString());
    }

    // Handle populated object
    if (typeof value === 'object' && value._id) {
        return new mongoose.Types.ObjectId(value._id.toString());
    }

    const trimmedVal = String(value).trim();
    if (!trimmedVal) return null;

    // Search for existing
    const query = { 
        lookup_type: type, 
        lookup_value: { $regex: new RegExp(`^${escapeRegExp(trimmedVal)}$`, 'i') } 
    };
    if (parent_lookup_id) query.parent_lookup_id = parent_lookup_id;

    const Lookup = getLookupModel();
    let lookup = await Lookup.findOne(query);

    // Create if not found
    if (!lookup) {
        lookup = await Lookup.create({
            lookup_type: type,
            lookup_value: trimmedVal,
            parent_lookup_id: parent_lookup_id
        });
        console.log(`[LOOKUP_RESOLVER] Created new ${type}: "${trimmedVal}" (Parent: ${parent_lookup_id || 'None'})`);
    }

    return lookup._id;
};

/**
 * Resolves a full address object hierarchically
 * Country -> State -> City -> Location/Area
 */
export const resolveHierarchicalAddress = async (addr) => {
    if (!addr) return null;

    const resolved = { ...addr };

    // 1. Country (Default to India if not specified but others are)
    const countryName = addr.country || ( (addr.state || addr.city) ? 'India' : null );
    const countryId = await resolveLookup('Country', countryName);
    if (countryId) resolved.country = countryId;

    // 2. State
    const stateId = await resolveLookup('State', addr.state, countryId);
    if (stateId) resolved.state = stateId;

    // 3. City
    const cityId = await resolveLookup('City', addr.city, stateId);
    if (cityId) resolved.city = cityId;

    // 4. Location / Area Resolution
    // User Specification: 'location' is ID, 'area' is Text
    const locationVal = addr.location || addr.locality || addr.sector || addr.area;
    if (locationVal) {
        const locationId = await resolveLookup('Area', locationVal, cityId);
        if (locationId) {
            resolved.location = locationId;
            resolved.locality = locationId;
        }
    }
    // Keep 'area' as raw text string
    resolved.area = addr.area || locationVal || '';

    // 5. Tehsil (ID)
    if (addr.tehsil) {
        resolved.tehsil = await resolveLookup('Tehsil', addr.tehsil, cityId);
    }

    // 6. Post Office (ID)
    if (addr.postOffice) {
        resolved.postOffice = await resolveLookup('PostOffice', addr.postOffice, cityId);
    }

    // 7. Pincode (ID - As per user's latest confirmation)
    const rawPin = addr.pincode || addr.pinCode;
    if (rawPin) {
        resolved.pincode = await resolveLookup('Pincode', rawPin, cityId);
    }

    return resolved;
};

// Internal Helper
const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
