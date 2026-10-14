import mongoose from 'mongoose';
import Lookup from '../models/Lookup.js';

/**
 * In-memory Lookup cache with TTL for ultra-fast lookup resolution across broadcasts.
 */
const lookupCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolves a field (which may be a MongoDB ObjectId, a populated object, a string, or an array)
 * into a human-readable string.
 */
export async function resolveLookupValue(val, fallback = '') {
    if (val === null || val === undefined || val === '') return fallback;

    // If it's an array, resolve each element and join with comma
    if (Array.isArray(val)) {
        const resolvedArr = await Promise.all(val.map(item => resolveLookupValue(item, '')));
        const filtered = resolvedArr.filter(Boolean);
        return filtered.length > 0 ? filtered.join(', ') : fallback;
    }

    // If it's already an object with label/name/lookup_value
    if (typeof val === 'object') {
        const directLabel = val.lookup_value || val.name || val.label || val.title || val.fullName;
        if (directLabel && typeof directLabel === 'string' && !/^[0-9a-fA-F]{24}$/.test(directLabel)) {
            return directLabel;
        }
        val = val._id || val.id || val;
    }

    const str = String(val).trim();
    if (!str) return fallback;

    // Check if it's a 24-character hex ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(str)) {
        const cached = lookupCache.get(str);
        const now = Date.now();
        if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
            return cached.value;
        }

        try {
            const doc = await Lookup.findById(str).select('lookup_value name label').lean();
            const resolved = doc ? (doc.lookup_value || doc.name || doc.label || str) : str;
            lookupCache.set(str, { value: resolved, timestamp: now });
            return resolved;
        } catch (err) {
            return str;
        }
    }

    return str;
}

/**
 * Formats a currency value to Indian numbering system (e.g., ₹ 2.50 Cr, ₹ 75 Lac, ₹ 45,000)
 */
export function formatCurrency(val, defaultVal = 'Price on Request') {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'string') {
        const cleaned = val.trim();
        if (cleaned.startsWith('₹')) return cleaned;
        if (/Cr|Lakh|Lac|k/i.test(cleaned) || isNaN(Number(cleaned))) {
            return `₹ ${cleaned}`;
        }
        const num = Number(cleaned);
        if (!isNaN(num)) return formatCurrency(num, defaultVal);
        return cleaned;
    }
    if (typeof val === 'number') {
        if (isNaN(val) || val <= 0) return defaultVal;
        if (val >= 10000000) {
            const cr = (val / 10000000).toFixed(2);
            return `₹ ${cr.replace(/\.00$/, '')} Cr`;
        }
        if (val >= 100000) {
            const lac = (val / 100000).toFixed(2);
            return `₹ ${lac.replace(/\.00$/, '')} Lac`;
        }
        return `₹ ${val.toLocaleString('en-IN')}`;
    }
    return defaultVal;
}

/**
 * Formats size specification from deal/inventory
 */
export function formatSize(sizeObjOrStr, sizeTypeStr = '', defaultVal = '') {
    if (!sizeObjOrStr && !sizeTypeStr) return defaultVal;

    let res = '';
    if (typeof sizeObjOrStr === 'object' && sizeObjOrStr !== null) {
        const val = sizeObjOrStr.value || sizeObjOrStr.size || sizeObjOrStr.area;
        const unit = sizeObjOrStr.unit || sizeObjOrStr.sizeUnit || 'Sq.Yd.';
        if (val) res = `${val} ${unit}`.trim();
    } else if (sizeObjOrStr && String(sizeObjOrStr).trim()) {
        res = String(sizeObjOrStr).trim();
    }

    if (sizeTypeStr && String(sizeTypeStr).trim()) {
        if (res) {
            if (!res.toLowerCase().includes(String(sizeTypeStr).toLowerCase())) {
                res = `${res} (${sizeTypeStr})`;
            }
        } else {
            res = String(sizeTypeStr).trim();
        }
    }

    return res || defaultVal;
}

/**
 * Deeply hydrates and builds the universal dictionary of variables for a Deal + Recipient + Sender.
 */
export async function buildUniversalContext({ deal, deals = [], recipient = {}, currentUser = {}, meta = {} }) {
    const primaryDeal = deal || (deals && deals.length > 0 ? deals[0] : {}) || {};
    const inventory = primaryDeal.inventoryId && typeof primaryDeal.inventoryId === 'object' ? primaryDeal.inventoryId : {};
    const project = primaryDeal.projectId && typeof primaryDeal.projectId === 'object' ? primaryDeal.projectId : {};
    const owner = primaryDeal.owner && typeof primaryDeal.owner === 'object' ? primaryDeal.owner : {};
    const partyOwner = primaryDeal.partyStructure?.owner && typeof primaryDeal.partyStructure.owner === 'object' ? primaryDeal.partyStructure.owner : {};

    // 1. Resolve Lookups
    const subCategory = await resolveLookupValue(primaryDeal.subCategory || inventory.subCategory || primaryDeal.propertyType || inventory.category || primaryDeal.category, 'Residential Plot');
    const category = await resolveLookupValue(primaryDeal.category || inventory.category || primaryDeal.propertyType, 'Residential');
    const direction = await resolveLookupValue(primaryDeal.direction || inventory.direction || inventory.orientation, 'North');
    const roadWidth = await resolveLookupValue(primaryDeal.roadWidth || inventory.roadWidth, '30 Feet');
    const facing = await resolveLookupValue(primaryDeal.facing || inventory.facing, 'Park Facing');
    const unitType = await resolveLookupValue(primaryDeal.unitType || inventory.unitType || inventory.builtupType || primaryDeal.builtupType, 'Plot');
    const builtupType = await resolveLookupValue(primaryDeal.builtupType || inventory.builtupType, 'Plot');
    const rawSizeType = await resolveLookupValue(primaryDeal.sizeType || inventory.sizeType || primaryDeal.sizeLabel, '');

    // 2. Resolve Size & Specs
    const formattedSize = formatSize(primaryDeal.size || inventory.size, rawSizeType, 'Prime Specs');

    // 3. Resolve Project & Title
    const projectName = primaryDeal.projectName || inventory.projectName || project.name || primaryDeal.title || meta.title || 'Verified Property';
    const unitNo = primaryDeal.unitNo || primaryDeal.unitNumber || inventory.unitNumber || inventory.unitNo || '';
    const block = primaryDeal.block || inventory.block || '';

    // 4. Resolve Location
    const rawLoc = primaryDeal.location || primaryDeal.locationDetails?.locality || inventory.location || meta.location || 'Kurukshetra';
    const location = await resolveLookupValue(rawLoc, 'Kurukshetra');
    const city = primaryDeal.locationDetails?.city || 'Kurukshetra';

    // 5. Resolve Pricing
    const rawPrice = primaryDeal.price || primaryDeal.quotePrice || primaryDeal.value || meta.price || inventory.price?.value;
    const price = formatCurrency(rawPrice, 'Price on Request');

    // 6. Resolve Owner / Contact Details
    const ownerMobile = (
        owner.phones?.[0]?.number ||
        owner.phones?.[0]?.phoneNumber ||
        owner.mobile ||
        partyOwner.phones?.[0]?.number ||
        partyOwner.phones?.[0]?.phoneNumber ||
        partyOwner.mobile ||
        primaryDeal.ownerMobile ||
        inventory.ownerMobile ||
        currentUser.mobile ||
        currentUser.phone ||
        '+91 9991333570'
    );

    const ownerName = (
        owner.name ||
        (owner.firstName ? `${owner.firstName} ${owner.lastName || ''}`.trim() : '') ||
        partyOwner.name ||
        primaryDeal.ownerName ||
        'Bharat Properties'
    );

    // 7. Resolve Deal Identifiers
    const dealCode = primaryDeal.dealCode || primaryDeal.dealId || primaryDeal.shareableId || meta.shareableId || `BP-${String(primaryDeal._id || '').slice(-6).toUpperCase()}`;

    // 8. Resolve Recipient Details
    const recipientName = (
        recipient.name ||
        (recipient.firstName ? `${recipient.firstName} ${recipient.lastName || ''}`.trim() : '') ||
        'Valued Partner'
    );
    const recipientFirstName = recipient.firstName || (recipientName.split(' ')[0] && recipientName.split(' ')[0] !== 'Valued' ? recipientName.split(' ')[0] : 'Partner');
    const recipientMobile = recipient.mobile || recipient.phone || '';
    const recipientEmail = recipient.email || '';

    // 9. Resolve Agent / Company
    const agentName = primaryDeal.assignedTo?.name || currentUser.name || 'Bharat Properties';
    const agentMobile = primaryDeal.assignedTo?.mobile || currentUser.mobile || '+91 9991333570';
    const companyName = 'Bharat Properties';

    // 10. Multi-Deal Property List Formatting
    let propertyList = '';
    if (deals && deals.length > 1) {
        propertyList = deals.map((d, i) => {
            const pTitle = d.title || d.projectName || d.dealCode || 'Deal';
            const pLoc = d.location || 'Kurukshetra';
            const pPrice = d.price ? formatCurrency(d.price) : 'P.O.R';
            return `${i + 1}️⃣ 🏢 *${pTitle}* | 💰 ${pPrice} | 📍 ${pLoc}`;
        }).join('\n');
    } else {
        propertyList = `🏢 *${projectName}*\n📍 ${location}\n💰 ${price}\n📐 ${formattedSize}\n📝 ${primaryDeal.remarks || primaryDeal.description || 'Verified property listing'}`;
    }

    // 11. Build the Normalized Universal Dictionary
    // Every key is stored in lowercase with symbols removed for fuzzy matching
    const contextMap = new Map();

    const register = (keys, val) => {
        const safeVal = (val !== null && val !== undefined) ? String(val).trim() : '';
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
            if (!k) continue;
            // Store original trimmed
            contextMap.set(k.trim(), safeVal);
            // Store canonical lowercase
            contextMap.set(k.trim().toLowerCase(), safeVal);
            // Store sanitized (alphanumeric only)
            const clean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (clean) contextMap.set(clean, safeVal);
        }
    };

    // Register all real estate attributes with all common syntax styles
    register(['projectName', 'project_name', 'projectname', 'project', 'property_title', 'propertytitle', 'title'], projectName);
    register(['unitNo', 'unitno', 'unit_no', 'unitNumber', 'unitnumber', 'unit_number', 'unit'], unitNo);
    register(['block', 'block_name', 'blockname', 'tower'], block);
    register(['subCategory', 'subcategory', 'sub_category', 'property_subcategory', 'property_sub_category'], subCategory);
    register(['category', 'property_category', 'propertycategory', 'propertyType', 'property_type', 'propertytype'], category);
    register(['sizeType', 'sizetype', 'size_type', 'size_label', 'sizelabel', 'size', 'property_size', 'propertysize', 'specs', 'property_specs'], formattedSize);
    register(['direction', 'property_direction', 'propertydirection', 'orientation'], direction);
    register(['roadWidth', 'roadwidth', 'road_width', 'road'], roadWidth);
    register(['facing', 'property_facing', 'propertyfacing', 'corner'], facing);
    register(['unitType', 'unittype', 'unit_type', 'builtupType', 'builtuptype', 'builtup_type'], unitType);
    register(['price', 'property_price', 'propertyprice', 'amount', 'quotePrice', 'quoteprice', 'quote_price', 'deal_price'], price);
    register(['ownerMobile', 'ownermobile', 'owner_mobile', 'ownerPhone', 'ownerphone', 'owner_phone', 'contact_mobile', 'contact_phone'], ownerMobile);
    register(['ownerName', 'ownername', 'owner_name', 'owner'], ownerName);
    register(['location', 'property_location', 'propertylocation', 'sector', 'city', 'preferred_city', 'preferred_area'], location);
    register(['dealCode', 'dealcode', 'deal_code', 'dealId', 'dealid', 'deal_id', 'ref', 'deal_ref', 'shareableId', 'shareableid', 'shareable_id'], dealCode);
    register(['description', 'remarks', 'property_list', 'property_list_default', 'property_list_dtl', 'matchListDefault', 'matchListDetailed'], propertyList);
    register(['customer_name', 'customername', 'first_name', 'firstname', 'full_name', 'fullname', 'name', 'lead_name', 'client_name', 'broker_name', 'brokername'], recipientName);
    register(['customer_first_name', 'first_name', 'firstname'], recipientFirstName);
    register(['customer_mobile', 'mobile', 'phone', 'recipient_phone', 'recipient_mobile'], recipientMobile);
    register(['customer_email', 'email'], recipientEmail);
    register(['agent_name', 'agentname', 'employee_name'], agentName);
    register(['agent_mobile', 'agentmobile', 'agent_phone', 'agentphone', 'employee_mobile'], agentMobile);
    register(['company_name', 'companyname', 'company'], companyName);

    // Positional standard mappings (Meta & DLT legacy {{1}}..{{7}})
    contextMap.set('1', recipientFirstName || recipientName);
    contextMap.set('2', projectName || propertyList);
    contextMap.set('3', price);
    contextMap.set('4', location);
    contextMap.set('5', formattedSize);
    contextMap.set('6', companyName);
    contextMap.set('7', agentMobile || ownerMobile);

    return {
        contextMap,
        data: {
            projectName,
            unitNo,
            block,
            subCategory,
            category,
            size: formattedSize,
            sizeType: rawSizeType,
            direction,
            roadWidth,
            facing,
            unitType,
            price,
            ownerMobile,
            ownerName,
            location,
            dealCode,
            recipientName,
            recipientFirstName,
            recipientMobile,
            recipientEmail,
            agentName,
            agentMobile,
            companyName
        }
    };
}

/**
 * Universal text interpolation function.
 * Matches all template placeholder syntaxes:
 * - {{var}}
 * - {{ var }}
 * - {var}
 * - {#var#}
 * - [var]
 */
export function interpolateUniversalTemplate(templateText, contextMap) {
    if (!templateText) return '';
    let result = String(templateText);

    // 1. Replace special recipient bracket tags
    result = result
        .replace(/\[Recipient \/ Broker Name\]/gi, contextMap.get('customer_name') || 'Partner')
        .replace(/\[Recipient \/ Group\]/gi, contextMap.get('customer_name') || 'Partner')
        .replace(/\[Broker Name\]/gi, contextMap.get('customer_name') || 'Partner')
        .replace(/\[Customer Name\]/gi, contextMap.get('customer_name') || 'Valued Client');

    // 2. Replace {{key}} and {{ key }}
    result = result.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey) => {
        const key = rawKey.trim();
        // Exact match
        if (contextMap.has(key)) return contextMap.get(key);
        // Lowercase match
        const lowerKey = key.toLowerCase();
        if (contextMap.has(lowerKey)) return contextMap.get(lowerKey);
        // Alphanumeric sanitized match
        const cleanKey = lowerKey.replace(/[^a-z0-9]/g, '');
        if (contextMap.has(cleanKey)) return contextMap.get(cleanKey);
        return match;
    });

    // 3. Replace {#key#} (DLT style)
    result = result.replace(/\{#\s*([^#]+?)\s*#\}/g, (match, rawKey) => {
        const key = rawKey.trim();
        if (contextMap.has(key)) return contextMap.get(key);
        const lowerKey = key.toLowerCase();
        if (contextMap.has(lowerKey)) return contextMap.get(lowerKey);
        const cleanKey = lowerKey.replace(/[^a-z0-9]/g, '');
        if (contextMap.has(cleanKey)) return contextMap.get(cleanKey);
        return match;
    });

    // 4. Replace {key} (Single brace style, but not CSS/JSON blocks)
    result = result.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, rawKey) => {
        const key = rawKey.trim();
        if (contextMap.has(key)) return contextMap.get(key);
        const lowerKey = key.toLowerCase();
        if (contextMap.has(lowerKey)) return contextMap.get(lowerKey);
        const cleanKey = lowerKey.replace(/[^a-z0-9]/g, '');
        if (contextMap.has(cleanKey)) return contextMap.get(cleanKey);
        return match;
    });

    return result;
}

export default {
    resolveLookupValue,
    formatCurrency,
    formatSize,
    buildUniversalContext,
    interpolateUniversalTemplate
};
