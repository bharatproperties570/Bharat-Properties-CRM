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

export function cleanSubCategory(val) {
    if (!val) return '';
    let s = typeof val === 'object' ? (val.lookup_value || val.name || val.title || val.label || '') : String(val);
    if (!s) return '';
    // 1. Remove parenthesized size specs, units, conversions, or numbers like "( Sq Yd)", "(8 Marla)", "(200 Sq. Yd)", "(200.00 Sq Yd)"
    s = s.replace(/\s*\([^)]*(?:sq|yd|ft|meter|marla|kanal|acre|gaj|bigha|yard|feet|size|\d)[^)]*\)/gi, '');
    // 2. Remove trailing/appended numbers with size units like "8 Marla", "200 Sq.Yd", "250 Gaj", "1 Kanal", "1000 Sq Ft", "8Marla"
    s = s.replace(/\s*\b\d+(?:\.\d+)?\s*(?:marla|kanal|acre|sq\.?\s*(?:yd|ft|meter|yard)|feet|gaj|bigha|kila|bhk)\b/gi, '');
    // 3. Remove standalone trailing unit names if any remained e.g. "Marla", "Sq Yd", "Sq.Ft"
    s = s.replace(/\s*\b(?:marla|kanal|acre|sq\.?\s*(?:yd|ft|meter|yard)|feet|gaj|bigha|kila)\b/gi, '');
    // 4. Clean up any remaining empty parentheses or dashes
    s = s.replace(/\s*\(\s*\)/g, '').replace(/[-–—]\s*$/, '').trim();
    return s;
}

/**
 * Formats size specification from deal/inventory
 */
export function formatSize(sizeObjOrStr, sizeTypeStr = '', defaultVal = '') {
    if (!sizeObjOrStr && !sizeTypeStr) return defaultVal;

    let res = '';
    if (typeof sizeObjOrStr === 'object' && sizeObjOrStr !== null) {
        const val = sizeObjOrStr.value || sizeObjOrStr.size || sizeObjOrStr.area;
        let unit = sizeObjOrStr.unit || sizeObjOrStr.sizeUnit || 'Sq.Yd.';
        unit = String(unit).replace(/\s*\(\s*sq\.?\s*yd\.?\s*\)/gi, '').trim();
        if (val) res = `${val} ${unit}`.trim();
    } else if (sizeObjOrStr && String(sizeObjOrStr).trim()) {
        res = String(sizeObjOrStr).trim();
    }

    const cleanSizeType = String(sizeTypeStr || '').trim();
    if (cleanSizeType) {
        if (res) {
            const cleanResBase = res.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
            const cleanTypeBase = cleanSizeType.toLowerCase();
            const normRes = cleanResBase.replace(/[^a-z0-9]/g, '');
            const normType = cleanTypeBase.replace(/[^a-z0-9]/g, '');
            if (normType.includes(normRes)) {
                res = cleanSizeType;
            } else if (normRes.includes(normType)) {
                // keep res
            } else {
                res = `${res} (${cleanSizeType})`;
            }
        } else {
            res = cleanSizeType;
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
    const rawSubCategory = await resolveLookupValue(primaryDeal.subCategory || inventory.subCategory || primaryDeal.propertyType || inventory.category || primaryDeal.category, 'Residential Plot');
    const subCategory = cleanSubCategory(rawSubCategory) || 'Residential Plot';
    const category = await resolveLookupValue(primaryDeal.category || inventory.category || primaryDeal.propertyType, 'Residential');
    const direction = await resolveLookupValue(primaryDeal.direction || inventory.direction || inventory.orientation, 'North');
    const roadWidth = await resolveLookupValue(primaryDeal.roadWidth || inventory.roadWidth, '30 Feet');
    const facing = await resolveLookupValue(primaryDeal.facing || inventory.facing, 'Park Facing');
    const unitType = await resolveLookupValue(primaryDeal.unitType || inventory.unitType || inventory.builtupType || primaryDeal.builtupType, 'Plot');
    const builtupType = await resolveLookupValue(primaryDeal.builtupType || inventory.builtupType, 'Plot');
    const rawSizeType = await resolveLookupValue(
        primaryDeal.sizeType || 
        inventory.sizeType || 
        primaryDeal.unitSpecification?.sizeLabel || 
        inventory.unitSpecification?.sizeLabel || 
        primaryDeal.sizeLabel || 
        inventory.sizeLabel, 
        ''
    );

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

    // 9. Resolve Agent / Employee / System Assignment
    let assignedUser = null;
    if (primaryDeal.assignedTo && typeof primaryDeal.assignedTo === 'object') {
        assignedUser = primaryDeal.assignedTo;
    } else if (primaryDeal.assignedTo && /^[0-9a-fA-F]{24}$/.test(String(primaryDeal.assignedTo))) {
        try {
            const User = mongoose.model('User');
            assignedUser = await User.findById(primaryDeal.assignedTo).select('name firstName lastName mobile phone email team').lean();
        } catch (e) {
            // ignore
        }
    }
    if (!assignedUser && currentUser && (currentUser.name || currentUser.mobile)) {
        assignedUser = currentUser;
    }

    const agentName = (
        assignedUser?.name ||
        (assignedUser?.firstName ? `${assignedUser.firstName} ${assignedUser.lastName || ''}`.trim() : '') ||
        currentUser.name ||
        'Bharat Properties'
    );
    const agentMobile = (
        assignedUser?.mobile ||
        assignedUser?.phone ||
        assignedUser?.phoneNumber ||
        currentUser.mobile ||
        currentUser.phone ||
        '+91 9991333570'
    );
    const agentEmail = (
        assignedUser?.email ||
        currentUser.email ||
        'deals@bharatproperties.co'
    );
    const assignedTeam = primaryDeal.team || assignedUser?.team || currentUser.team || 'Sales Team';
    const assignedVisibility = primaryDeal.visibleTo || primaryDeal.visibility || 'Everyone';
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
    register(['EmployeeName', 'employeeName', 'employee_name', 'employeename', 'agent_name', 'agentname', 'agentName', 'assignedTo', 'assigned_to', 'assignedto'], agentName);
    register(['EmployeeMobile', 'employeeMobile', 'employee_mobile', 'employeemobile', 'agent_mobile', 'agentmobile', 'agentMobile', 'agent_phone', 'agentphone'], agentMobile);
    register(['EmployeeEmail', 'employeeEmail', 'employee_email', 'employeemail', 'agent_email', 'agentemail', 'agentEmail'], agentEmail);
    register(['team', 'team_name', 'teamName'], assignedTeam);
    register(['visibleTo', 'visible_to', 'visibleto', 'visibility'], assignedVisibility);
    register(['company_name', 'companyname', 'company'], companyName);

    // Positional standard mappings (Meta & DLT legacy {{1}}..{{7}})
    contextMap.set('1', recipientFirstName || recipientName);
    contextMap.set('2', projectName || propertyList);
    contextMap.set('3', price);
    contextMap.set('4', location);
    contextMap.set('5', formattedSize);
    contextMap.set('6', agentName || companyName);
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
            agentEmail,
            companyName,
            EmployeeName: agentName,
            employeeName: agentName,
            EmployeeMobile: agentMobile,
            employeeMobile: agentMobile,
            EmployeeEmail: agentEmail,
            employeeEmail: agentEmail,
            team: assignedTeam,
            team_name: assignedTeam,
            assignedTo: agentName,
            visibleTo: assignedVisibility
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
export function interpolateUniversalTemplate(templateText, contextInput) {
    if (!templateText) return '';

    let map;
    if (contextInput instanceof Map) {
        map = contextInput;
    } else if (contextInput?.contextMap instanceof Map) {
        map = contextInput.contextMap;
    } else if (contextInput && typeof contextInput === 'object') {
        const dict = contextInput.namedContext || contextInput;
        map = new Map(Object.entries(dict));
    } else {
        map = new Map();
    }

    const getVal = (k) => {
        if (!map) return undefined;
        if (map.has(k)) return map.get(k);
        const lower = String(k).toLowerCase();
        if (map.has(lower)) return map.get(lower);
        const clean = lower.replace(/[^a-z0-9]/g, '');
        if (map.has(clean)) return map.get(clean);
        return undefined;
    };
    const hasKey = (k) => getVal(k) !== undefined;

    let result = String(templateText);

    // 1. Replace special recipient bracket tags
    result = result
        .replace(/\[Recipient \/ Broker Name\]/gi, getVal('customer_name') || 'Partner')
        .replace(/\[Recipient \/ Group\]/gi, getVal('customer_name') || 'Partner')
        .replace(/\[Broker Name\]/gi, getVal('customer_name') || 'Partner')
        .replace(/\[Customer Name\]/gi, getVal('customer_name') || 'Valued Client');

    // 2. Replace {{key}} and {{ key }}
    result = result.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey) => {
        const key = rawKey.trim();
        // Exact match
        if (hasKey(key)) return getVal(key);
        // Lowercase match
        const lowerKey = key.toLowerCase();
        if (hasKey(lowerKey)) return getVal(lowerKey);
        // Alphanumeric sanitized match
        const cleanKey = lowerKey.replace(/[^a-z0-9]/g, '');
        if (hasKey(cleanKey)) return getVal(cleanKey);
        return match;
    });

    // 3. Replace {#key#} (DLT style)
    result = result.replace(/\{#\s*([^#]+?)\s*#\}/g, (match, rawKey) => {
        const key = rawKey.trim();
        if (hasKey(key)) return getVal(key);
        const lowerKey = key.toLowerCase();
        if (hasKey(lowerKey)) return getVal(lowerKey);
        const cleanKey = lowerKey.replace(/[^a-z0-9]/g, '');
        if (hasKey(cleanKey)) return getVal(cleanKey);
        return match;
    });

    // 4. Replace {key} (Single brace style, but not CSS/JSON blocks)
    result = result.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, rawKey) => {
        const key = rawKey.trim();
        if (hasKey(key)) return getVal(key);
        const lowerKey = key.toLowerCase();
        if (hasKey(lowerKey)) return getVal(lowerKey);
        const cleanKey = lowerKey.replace(/[^a-z0-9]/g, '');
        if (hasKey(cleanKey)) return getVal(cleanKey);
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
