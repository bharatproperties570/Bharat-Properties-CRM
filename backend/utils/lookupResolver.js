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
    
    // 🛡️ [DATA INTEGRITY] Only apply parent_lookup_id if it's a valid ObjectId string/object
    // This prevents "Cast to ObjectId failed for value 'true'" errors if a boolean is accidentally passed
    if (parent_lookup_id && mongoose.Types.ObjectId.isValid(parent_lookup_id)) {
        query.parent_lookup_id = parent_lookup_id;
    } else if (parent_lookup_id) {
        console.warn(`[LOOKUP_RESOLVER] Invalid parent_lookup_id skipped for ${type}: "${parent_lookup_id}" (Type: ${typeof parent_lookup_id})`);
    }

    const Lookup = getLookupModel();
    let lookup = await Lookup.findOne(query);

    // Create if not found
    if (!lookup) {
        const createData = {
            lookup_type: type,
            lookup_value: trimmedVal
        };
        
        if (parent_lookup_id && mongoose.Types.ObjectId.isValid(parent_lookup_id)) {
            createData.parent_lookup_id = parent_lookup_id;
        }

        lookup = await Lookup.create(createData);
        console.log(`[LOOKUP_RESOLVER] Created new ${type}: "${trimmedVal}" (Parent: ${mongoose.Types.ObjectId.isValid(parent_lookup_id) ? parent_lookup_id : 'None'})`);
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

    // 4. Location / Area Resolution (Priority: Sector/Village/Locality -> Location Lookup ID)
    let locationVal = null;
    let backupAreaVal = '';

    const rawArea = addr.area || '';
    const rawLoc = addr.location || addr.locality || '';
    const rawSector = addr.sector || '';

    if (/sector|sec\b/i.test(rawArea)) {
        locationVal = rawArea;
        backupAreaVal = rawLoc;
    } else if (/sector|sec\b/i.test(rawSector)) {
        locationVal = rawSector;
        backupAreaVal = rawLoc;
    } else if (/village|vpo\b/i.test(rawLoc)) {
        locationVal = rawLoc;
        backupAreaVal = rawArea;
    } else {
        locationVal = addr.location || addr.locality || addr.sector || addr.area;
        backupAreaVal = (locationVal === addr.area) ? (addr.location || addr.locality || '') : (addr.area || '');
    }

    if (locationVal) {
        const locationId = await resolveLookup('Location', locationVal, cityId);
        if (locationId) {
            resolved.location = locationId;
            resolved.locality = locationId;
        }
    }
    // Keep 'area' as raw text string
    resolved.area = backupAreaVal || addr.area || '';

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
