import SystemSetting from '../src/modules/systemSettings/system.model.js';
import Lookup from '../models/Lookup.js';

/**
 * Helper to get a human-readable lookup value.
 * We cache lookups in memory for the duration of the request to avoid DB thrashing.
 */
const resolveLookup = async (val, type, lookupsCache) => {
    if (!val) return '';
    
    let idVal = val;
    if (typeof val === 'object') {
        const label = val.lookup_value || val.name || val.label || val.fullName;
        if (label && typeof label !== 'object' && !/^[0-9a-fA-F]{24}$/.test(String(label))) return String(label);
        idVal = val._id || val.id || val;
    }

    const idStr = String(idVal).trim();
    if (!/^[0-9a-fA-F]{24}$/.test(idStr)) {
        return idStr;
    }

    if (!lookupsCache[idStr]) {
        try {
            const lookup = await Lookup.findById(idStr).lean();
            if (lookup) {
                lookupsCache[idStr] = lookup.lookup_value || lookup.name || lookup.label || idStr;
            } else {
                lookupsCache[idStr] = idStr;
            }
        } catch (err) {
            lookupsCache[idStr] = idStr;
        }
    }
    return lookupsCache[idStr];
};

const renderValue = (val, defaultVal = '') => {
    return val !== undefined && val !== null && val !== '' ? String(val) : defaultVal;
};

const formatCurrency = (val, defaultVal = 'Price on Request') => {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'string') {
        const cleaned = val.trim();
        if (cleaned.startsWith('₹')) return cleaned;
        if (/Cr|Lakh|Lac|k/i.test(cleaned) || isNaN(Number(cleaned))) {
            return `₹ ${cleaned}`;
        }
        const num = Number(cleaned);
        if (!isNaN(num)) return `₹ ${num.toLocaleString('en-IN')}`;
        return cleaned;
    }
    if (typeof val === 'number') {
        return `₹ ${val.toLocaleString('en-IN')}`;
    }
    return defaultVal;
};

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

export function cleanProjectName(val) {
    if (!val) return '';
    let s = typeof val === 'object' ? (val.name || val.title || val.projectName || val.lookup_value || '') : String(val);
    if (!s) return '';
    // Strip suffixes like " | Ordinary for Sell", " | Plot for Sell", " | House for Sale", etc.
    s = s.split(' | ')[0].trim();
    if (s.includes(' - ') && /(?:sell|sale|rent|ordinary|corner|plot|house|flat|booth|shop|sco)/i.test(s)) {
        s = s.split(' - ')[0].trim();
    }
    s = s.replace(/\s*(?:\||-)?\s*ordinary\s*(?:for\s*)?(?:sell|sale)?/gi, '').trim();
    s = s.replace(/\s*(?:\||-)?\s*(?:for\s*)?(?:sell|sale)$/gi, '').trim();
    return s;
}

export const resolveMessageTemplate = async (template, channel, recipient, properties, currentUser) => {
    let resolvedBody = '';
    const components = [];
    const lookupsCache = {};

    // Get variable registry from system settings (with safety timeout)
    let variableRegistry = {};
    try {
        const regSetting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).maxTimeMS(3000).lean();
        if (regSetting && regSetting.value) {
            variableRegistry = regSetting.value;
        }
    } catch (err) {
        console.warn('[templateResolver] Messaging variable registry fetch delayed, using defaults:', err.message);
    }

    const hasProperties = properties && Array.isArray(properties) && properties.length > 0;

    const getPropVal = (key) => {
        if (!hasProperties) return '';
        const p = properties[0];
        const labelKey = `${key}_label`;
        if (p.inventoryId && typeof p.inventoryId === 'object' && p.inventoryId[labelKey] !== undefined && p.inventoryId[labelKey] !== null && p.inventoryId[labelKey] !== '') {
            return p.inventoryId[labelKey];
        }
        let val = p[key];
        if (val === null || val === undefined || val === '') {
            if (p.unitSpecification && typeof p.unitSpecification === 'object') {
                val = p.unitSpecification[key];
            }
        }
        if (val === null || val === undefined || val === '') {
            if (p.inventoryId && typeof p.inventoryId === 'object') {
                val = p.inventoryId[key];
                if ((val === null || val === undefined || val === '') && p.inventoryId.unitSpecification && typeof p.inventoryId.unitSpecification === 'object') {
                    val = p.inventoryId.unitSpecification[key];
                }
            }
        }
        if (val && typeof val === 'object') {
            if (val.lookup_value) return val.lookup_value;
            if (val.name) return val.name;
            if (val.title) return val.title;
            if (val.label) return val.label;
            if (val._id) val = val._id;
        }
        return val !== undefined && val !== null ? val : '';
    };

    let categoryRaw = getPropVal('category') || getPropVal('propertyType');
    let categoryResolved = await resolveLookup(categoryRaw, 'Category', lookupsCache);

    let subCategoryRaw = getPropVal('subCategory');
    let rawSubCategoryResolved = await resolveLookup(subCategoryRaw, 'SubCategory', lookupsCache);
    let subCategoryResolved = cleanSubCategory(rawSubCategoryResolved);

    let builtupTypeRaw = getPropVal('builtupType');
    let builtupTypeResolved = builtupTypeRaw && !/^[0-9a-fA-F]{24}$/.test(String(builtupTypeRaw))
        ? builtupTypeRaw
        : await resolveLookup(builtupTypeRaw, 'BuiltupType', lookupsCache);

    let sizeLabelRaw = getPropVal('sizeLabel') || getPropVal('sizeConfig');
    let sizeLabelResolved = (sizeLabelRaw && !/^[0-9a-fA-F]{24}$/.test(String(sizeLabelRaw)))
        ? sizeLabelRaw
        : (await resolveLookup(sizeLabelRaw, 'Size', lookupsCache) || getPropVal('size'));

    let directionRaw = getPropVal('direction');
    let directionResolved = directionRaw && !/^[0-9a-fA-F]{24}$/.test(String(directionRaw))
        ? directionRaw
        : await resolveLookup(directionRaw, 'Direction', lookupsCache);

    let facingRaw = getPropVal('facing');
    let facingResolved = facingRaw && !/^[0-9a-fA-F]{24}$/.test(String(facingRaw))
        ? facingRaw
        : await resolveLookup(facingRaw, 'Facing', lookupsCache);

    let roadWidthRaw = getPropVal('roadWidth');
    let roadWidthResolved = roadWidthRaw && !/^[0-9a-fA-F]{24}$/.test(String(roadWidthRaw))
        ? roadWidthRaw
        : await resolveLookup(roadWidthRaw, 'RoadWidth', lookupsCache);

    let sizeRaw = getPropVal('size');
    let sizeVal = typeof sizeRaw === 'object' 
        ? (sizeRaw.value ? `${sizeRaw.value} ${String(sizeRaw.unit || 'Sq.Yd.').replace(/\s*\(\s*sq\.?\s*yd\.?\s*\)/gi, '').trim()}` : '') 
        : sizeRaw;

    let finalSizeSpec = '';
    if (sizeLabelResolved && sizeVal) {
        const cleanVal = String(sizeVal).replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
        const cleanLabel = String(sizeLabelResolved).toLowerCase();
        const normVal = cleanVal.replace(/[^a-z0-9]/g, '');
        const normLabel = cleanLabel.replace(/[^a-z0-9]/g, '');
        if (normLabel.includes(normVal)) {
            finalSizeSpec = sizeLabelResolved;
        } else if (normVal.includes(normLabel)) {
            finalSizeSpec = sizeVal;
        } else {
            finalSizeSpec = `${sizeVal} (${sizeLabelResolved})`;
        }
    } else {
        finalSizeSpec = sizeLabelResolved || sizeVal || '';
    }

    let priceVal = getPropVal('price');
    let rawProjectName = getPropVal('projectName') || getPropVal('title') || getPropVal('unitNo');
    let projectNameVal = cleanProjectName(rawProjectName);

    let locationRaw = getPropVal('location') || getPropVal('city') || getPropVal('sector');
    let locationResolved = await resolveLookup(locationRaw, 'Location', lookupsCache) || locationRaw;

    // 🌟 SENIOR CONTEXTUAL FALLBACKS: If properties array is empty, resolve from recipient/lead requirement data
    if (!hasProperties) {
        categoryResolved = categoryResolved || recipient?.requirement || recipient?.requirementType || (Array.isArray(recipient?.propertyType) ? recipient.propertyType[0] : recipient?.propertyType) || 'Commercial / Residential';
        subCategoryResolved = cleanSubCategory(subCategoryResolved || (Array.isArray(recipient?.subType) ? recipient.subType[0] : recipient?.subType)) || 'Plot';
        locationResolved = locationResolved || recipient?.locArea || recipient?.locCity || recipient?.location || recipient?.searchLocation || 'Sector 3, Kurukshetra';
        priceVal = priceVal ? formatCurrency(priceVal) : (recipient?.budgetMax ? formatCurrency(recipient.budgetMax) : (recipient?.budgetMin ? formatCurrency(recipient.budgetMin) : (recipient?.budget ? formatCurrency(recipient.budget) : 'Attractive Price')));
        finalSizeSpec = finalSizeSpec || (recipient?.sizeType?.[0] ? `${recipient.sizeType[0]} ${recipient.areaMetric || 'Sq.Yd.'}` : '250 Sq.Yd.');
        projectNameVal = projectNameVal || (recipient?.projectName?.[0] || 'Featured Property Listing');
    }

    let propertyListDefault = '';
    let propertyListDetailed = '';
    
    if (hasProperties) {
        for (let i = 0; i < properties.length; i++) {
            const p = properties[i];
            const propVal = (key) => {
                let v = p[key];
                if (v === null || v === undefined || v === '') {
                    if (p.inventoryId && typeof p.inventoryId === 'object') v = p.inventoryId[key];
                }
                return v !== undefined && v !== null ? v : '';
            };
            const loc = propVal('location') || propVal('city') || propVal('sector');
            const resolvedLoc = await resolveLookup(loc, 'Location', lookupsCache) || loc || 'Sector';
            const pTitle = cleanProjectName(propVal('projectName') || propVal('title') || propVal('unitNo')) || 'Unit';
            const pPrice = propVal('price') ? formatCurrency(propVal('price'), 'P.O.R') : 'P.O.R';
            propertyListDefault += `${i + 1}️⃣ 🏢 *${pTitle}* - 📍 ${resolvedLoc} | 💰 ${pPrice}\n`;
            
            const szRaw = propVal('size');
            const szVal = typeof szRaw === 'object' ? (szRaw.value ? `${szRaw.value} ${szRaw.unit || 'Sq.Yd.'}` : '') : szRaw;
            propertyListDetailed += `${i + 1}️⃣ 🏢 *${pTitle}*\n📍 ${resolvedLoc}\n📏 Size: ${szVal || 'Prime'}\n💰 Price: ${pPrice}\n`;
        }
        propertyListDefault = propertyListDefault.trim();
        propertyListDetailed = propertyListDetailed.trim();
    } else {
        propertyListDefault = `1️⃣ 🏢 *${projectNameVal || 'Verified Listing'}*\n📍 Location: ${locationResolved || 'Kurukshetra'}${sizeVal ? `\n📏 Size: ${sizeVal}` : ''}\n💰 Price: ${priceVal || 'Price on Request'}`;
        propertyListDetailed = `1️⃣ 🏢 *${projectNameVal || 'Verified Listing'}*\n📍 Location: ${locationResolved || 'Kurukshetra'}${sizeVal ? `\n📏 Size: ${sizeVal}` : ''}\n💰 Price: ${priceVal || 'Price on Request'}\n✨ Status: Verified & Ready for Inspection`;
    }

    const agentName = recipient?.assignedTo?.fullName || recipient?.assignedTo?.name || recipient?.owner || recipient?.agentName || currentUser?.fullName || currentUser?.name || 'Bharat Properties';
    const agentMobile = recipient?.assignment?.assignedTo?.mobile || recipient?.assignedTo?.mobile || recipient?.ownerMobile || recipient?.agentMobile || currentUser?.mobile || currentUser?.phone || '+91 9991333570';
    const agentDetails = agentMobile ? `${agentName} (📞 ${agentMobile})` : agentName;

    const rawCustName = recipient?.name || (recipient?.firstName ? `${recipient.firstName} ${recipient?.lastName || recipient?.surname || ''}`.trim() : '') || 'Valued Client';
    const cleanCustName = rawCustName && !/^[0-9a-fA-F]{24}$/.test(rawCustName) ? rawCustName : 'Valued Client';
    const custFirstName = recipient?.firstName || (cleanCustName.split(' ')[0] && cleanCustName.split(' ')[0] !== 'Valued' ? cleanCustName.split(' ')[0] : cleanCustName);

    const unifiedContext = {
        // Customer / Lead Data
        'full_name': cleanCustName,
        'fullname': cleanCustName,
        'name': cleanCustName,
        'customer_name': custFirstName,
        'customername': custFirstName,
        'first_name': custFirstName,
        'firstname': custFirstName,
        'client_name': cleanCustName,
        'lead_name': cleanCustName,
        'owner_name': cleanCustName,
        'ownername': cleanCustName,
        'last_name': recipient?.surname || recipient?.lastName || '',
        'lastname': recipient?.surname || recipient?.lastName || '',
        'mobile': recipient?.phone || recipient?.mobile || '',
        'phone': recipient?.phone || recipient?.mobile || '',
        'email': recipient?.email || '',
        'lead_source': recipient?.source || 'Direct Inquiry',
        'lead_status': recipient?.status || recipient?.stage || 'Active',
        'lead_stage': recipient?.stage || recipient?.status || 'Active',
        'lead_requirement': recipient?.requirement || recipient?.requirementType || categoryResolved || 'Property Requirement',
        'budget_min': recipient?.budgetMin || recipient?.budget || '',
        'budget_max': recipient?.budgetMax || '',
        'budget': recipient?.budgetMax ? formatCurrency(recipient.budgetMax) : (recipient?.budgetMin ? formatCurrency(recipient.budgetMin) : (recipient?.budget ? formatCurrency(recipient.budget) : 'Attractive Budget')),
        'preferred_city': recipient?.locCity || recipient?.location || 'Kurukshetra',
        'preferred_area': recipient?.locArea || locationResolved || 'Sector 3',
        
        // System & Assignment Data
        'team': recipient?.team || recipient?.assignment?.team || 'Sales Team',
        'team_name': recipient?.team || recipient?.assignment?.team || 'Sales Team',
        'assignedTo': agentName || 'Bharat Properties',
        'assignedto': agentName || 'Bharat Properties',
        'visibleTo': recipient?.visibleTo || 'Everyone',
        'visibleto': recipient?.visibleTo || 'Everyone',
        'EmployeeName': agentName || 'Bharat Properties',
        'employeename': agentName || 'Bharat Properties',
        'employee_name': agentName || 'Bharat Properties',
        'EmployeeMobile': agentMobile || '+91 9991333570',
        'employeemobile': agentMobile || '+91 9991333570',
        'employee_mobile': agentMobile || '+91 9991333570',
        'employee_email': recipient?.assignedTo?.email || currentUser?.email || 'deals@bharatproperties.co',
        'ownerMobile': agentMobile || '+91 9991333570',
        'ownermobile': agentMobile || '+91 9991333570',
        'ownerEmail': recipient?.assignedTo?.email || currentUser?.email || 'deals@bharatproperties.co',
        'owneremail': recipient?.assignedTo?.email || currentUser?.email || 'deals@bharatproperties.co',

        // Agent / System Data
        'agent_name': agentName || 'Bharat Properties',
        'agentname': agentName || 'Bharat Properties',
        'agent_mobile': agentMobile || '+91 9991333570',
        'agentmobile': agentMobile || '+91 9991333570',
        'agent_phone': agentMobile || '+91 9991333570',
        'agentphone': agentMobile || '+91 9991333570',
        'agent_email': recipient?.assignedTo?.email || currentUser?.email || 'deals@bharatproperties.co',
        'company_name': 'Bharat Properties',
        'companyname': 'Bharat Properties',

        // Property Data
        'project_name': projectNameVal || 'Featured Property Listing',
        'projectname': projectNameVal || 'Featured Property Listing',
        'property_title': projectNameVal || 'Featured Property Listing',
        'title': projectNameVal || 'Featured Property Listing',
        'unit_number': getPropVal('unitNo') || 'Unit 1',
        'unitnumber': getPropVal('unitNo') || 'Unit 1',
        'unit': getPropVal('unitNo') || 'Unit 1',
        'unitNo': getPropVal('unitNo') || 'Unit 1',
        'block_name': getPropVal('block') || 'Block A',
        'unit_type': await resolveLookup(getPropVal('unitType'), 'UnitType', lookupsCache) || 'Plot',
        'unitType': await resolveLookup(getPropVal('unitType'), 'UnitType', lookupsCache) || 'Plot',
        'property_category': categoryResolved || 'Residential Plot',
        'property_subcategory': subCategoryResolved || 'Plot',
        'subCategory': subCategoryResolved || 'Plot',
        'subcategory': subCategoryResolved || 'Plot',
        'sub_category': subCategoryResolved || 'Plot',
        'property_type': categoryResolved || 'Residential Plot',
        'builtup_type': builtupTypeResolved || 'Plot',
        'size_label': finalSizeSpec || '250 Sq.Yd.',
        'property_size': finalSizeSpec || '250 Sq.Yd.',
        'size': finalSizeSpec || '250 Sq.Yd.',
        'specs': finalSizeSpec || '250 Sq.Yd.',
        'sizeType': finalSizeSpec || '250 Sq.Yd.',
        'sizetype': finalSizeSpec || '250 Sq.Yd.',
        'size_type': finalSizeSpec || '250 Sq.Yd.',
        'property_direction': directionResolved || '',
        'direction': directionResolved || '',
        'property_facing': facingResolved || '',
        'facing': facingResolved || '',
        'road_width': roadWidthResolved || '',
        'roadWidth': roadWidthResolved || '',
        'roadwidth': roadWidthResolved || '',
        'road': roadWidthResolved || '',
        'builtup_type': builtupTypeResolved || '',
        'builtupType': builtupTypeResolved || '',
        'property_price': formatCurrency(priceVal, 'Price on Request'),
        'price': formatCurrency(priceVal, 'Price on Request'),
        'amount': formatCurrency(priceVal, 'Price on Request'),
        'property_location': locationResolved || 'Sector 3, Kurukshetra',
        'location': locationResolved || 'Sector 3, Kurukshetra',
        'sector': locationResolved || 'Sector 3',
        'dealCode': getPropVal('dealCode') || 'DEAL-REF',
        'ref': getPropVal('dealCode') || 'DEAL-REF',
        'shareableId': getPropVal('dealCode') || 'DEAL-REF',
        'intent': getPropVal('intent') || getPropVal('primaryDealIntent') || recipient?.intent || 'Sell',
        'deal_intent': getPropVal('intent') || getPropVal('primaryDealIntent') || recipient?.intent || 'Sell',
        'dealIntent': getPropVal('intent') || getPropVal('primaryDealIntent') || recipient?.intent || 'Sell',
        'primaryDealIntent': getPropVal('intent') || getPropVal('primaryDealIntent') || recipient?.intent || 'Sell',
        'transactionType': getPropVal('transactionType') || recipient?.transactionType || 'Full White',
        'transactiontype': getPropVal('transactionType') || recipient?.transactionType || 'Full White',
        'transaction_type': getPropVal('transactionType') || recipient?.transactionType || 'Full White',
        'dealType': getPropVal('dealType') || recipient?.dealType || 'Direct',
        'dealtype': getPropVal('dealType') || recipient?.dealType || 'Direct',
        'deal_type': getPropVal('dealType') || recipient?.dealType || 'Direct',
        
        // Dynamic / Match Data
        'property_list': propertyListDefault,
        'property_list_default': propertyListDefault,
        'property_list_detailed': propertyListDetailed,
        'property_list_dtl': propertyListDetailed,
        'matchListDefault': propertyListDefault,
        'requirement_summary': (recipient?.requirement || recipient?.requirementType) ? `Looking for ${recipient?.requirement || recipient?.requirementType} in ${locationResolved} (Budget: ${priceVal})` : `Curated ${categoryResolved} in ${locationResolved}`,
        'properties_count': String(properties?.length || 1),
        'match_percentage': '98',
        'due_date': 'This Weekend',
        'document_list': '• Aadhaar Card\n• PAN Card\n• Booking Cheque / Receipt'
    };

    const seen = new Set();
    const resolveVars = (text) => {
        if (!text) return text;
        return text.replace(/{{([^}]+)}}/g, (match, vIdx) => {
            const cleanKey = vIdx.trim();
            const lowerKey = cleanKey.toLowerCase();
            
            // 1. Direct match in unifiedContext
            if (unifiedContext[cleanKey] !== undefined && unifiedContext[cleanKey] !== '') {
                const val = renderValue(unifiedContext[cleanKey], '');
                if (!seen.has(cleanKey)) {
                    components.push({ type: 'text', parameter_name: cleanKey, text: val });
                    seen.add(cleanKey);
                }
                return val;
            }

            // 2. Case-insensitive match in unifiedContext
            const matchedKey = Object.keys(unifiedContext).find(k => k.toLowerCase() === lowerKey);
            if (matchedKey && unifiedContext[matchedKey] !== undefined && unifiedContext[matchedKey] !== '') {
                const val = renderValue(unifiedContext[matchedKey], '');
                if (!seen.has(matchedKey)) {
                    components.push({ type: 'text', parameter_name: matchedKey, text: val });
                    seen.add(matchedKey);
                }
                return val;
            }

            // 3. Numbered Placeholders (e.g. {{1}}, {{2}}, {{3}}, ...)
            if (/^\d+$/.test(cleanKey)) {
                const num = cleanKey;
                let targetKey = null;

                if (variableRegistry && variableRegistry[num]) {
                    const reg = variableRegistry[num];
                    targetKey = typeof reg === 'object' ? reg.source : reg;
                }

                if (targetKey && unifiedContext[targetKey] !== undefined && unifiedContext[targetKey] !== '') {
                    const val = renderValue(unifiedContext[targetKey], '');
                    if (!seen.has(num)) {
                        components.push({ type: 'text', parameter_name: num, text: val });
                        seen.add(num);
                    }
                    return val;
                }

                // Positional standard fallbacks for numbered placeholders
                const n = parseInt(num, 10);
                let posVal = '';
                switch (n) {
                    case 1:
                        posVal = unifiedContext['first_name'] || unifiedContext['customer_name'] || 'Valued Client';
                        break;
                    case 2:
                        posVal = unifiedContext['property_list_default'] || unifiedContext['project_name'] || unifiedContext['property_category'] || 'Verified Property Listing';
                        break;
                    case 3:
                        posVal = unifiedContext['property_price'] || unifiedContext['agent_name'] || 'Attractive Price';
                        break;
                    case 4:
                        posVal = unifiedContext['property_location'] || 'Sector 3, Kurukshetra';
                        break;
                    case 5:
                        posVal = unifiedContext['property_size'] || unifiedContext['size'] || '';
                        break;
                    case 6:
                        posVal = unifiedContext['agent_name'] || 'Bharat Properties';
                        break;
                    case 7:
                        posVal = unifiedContext['agent_mobile'] || '+91 9991333570';
                        break;
                    default:
                        posVal = '-';
                        break;
                }
                if (!seen.has(num)) {
                    components.push({ type: 'text', parameter_name: num, text: posVal });
                    seen.add(num);
                }
                return posVal;
            }
            
            // 4. Fallbacks for specific legacy/hardcoded strings
            const legacyHardcoded = {
                'match_count': 'several',
                'old_price': 'N/A',
                'new_price': 'N/A',
                'savings': 'N/A',
                'deadline': 'tomorrow',
                'amount': unifiedContext['property_price'] || 'the due amount',
                'due_date': 'This Weekend',
                'payment_type': 'payment',
                'payment_methods': 'Bank Transfer / UPI',
                'match_percentage': '98',
                'match_reasons': '- Matches your budget\n- Preferred location\n- Right size',
                'competing_buyers': '2',
                'slot_1': 'Tomorrow 10 AM',
                'slot_2': 'Tomorrow 2 PM',
                'slot_3': 'Day after 11 AM',
                'positive_feedback': 'Location, Amenities',
                'concerns': 'Price negotiation',
                'next_steps': 'I will share a revised offer',
                'document_list': '• Aadhaar Card\n• PAN Card\n• Booking Cheque / Receipt'
            };
            
            if (legacyHardcoded[lowerKey] !== undefined) {
                const val = renderValue(legacyHardcoded[lowerKey], '');
                if (!seen.has(lowerKey)) {
                    components.push({ type: 'text', parameter_name: lowerKey, text: val });
                    seen.add(lowerKey);
                }
                return val;
            }

            return match;
        });
    };

    if (channel === 'SMS' || channel === 'RCS') {
        resolvedBody = resolveVars(template.body || template.content || '');
    } else if (channel === 'WHATSAPP') {
        const bodyComp = template.components?.find(c => c.type === 'BODY');
        if (bodyComp) {
            resolvedBody = resolveVars(bodyComp.text || template.body || '');
        } else {
            resolvedBody = resolveVars(template.body || template.content || template.text || '');
        }

        const buttonComp = template.components?.find(c => c.type === 'BUTTONS');
        if (buttonComp?.buttons) {
            buttonComp.buttons.forEach(btn => {
                if (btn.url) resolveVars(btn.url);
            });
        }
        
        resolvedBody = resolvedBody.replace(/{{Name}}/gi, cleanCustName);
        resolvedBody = resolvedBody.replace(/{{FirstName}}/gi, custFirstName);
        resolvedBody = resolvedBody.replace(/{{Phone}}/gi, recipient?.phone || recipient?.mobile || 'your phone');

        // SAFETY FILTER: Strip any surviving raw MongoDB ObjectIds (24-char hex)
        resolvedBody = resolvedBody.replace(/\b[0-9a-fA-F]{24}\b/g, categoryResolved);
    }

    return {
        resolvedBody,
        components,
        language: template.language || 'en_US',
        rcsTitle: channel === 'RCS' ? (template.name || '') : undefined,
        rcsActions: channel === 'RCS' ? (template.buttons || []) : undefined
    };
};

/**
 * Enterprise Variable Interpolator:
 * Resolves all template variables (named and positional) against Recipient, Agent, Property, and Activity data.
 */
export const interpolateTemplateText = (rawText, { recipient = {}, agent = {}, property = {}, activity = {} } = {}) => {
    if (!rawText || typeof rawText !== 'string') return rawText || '';

    // If text does not contain any template brackets, return early
    if (!rawText.includes('{{')) return rawText;

    // 1. Recipient Normalization
    const rawFullName = recipient?.name || (recipient?.firstName ? `${recipient.firstName} ${recipient.lastName || ''}`.trim() : '') || '';
    const cleanFullName = rawFullName && !/^[0-9a-fA-F]{24}$/.test(rawFullName) ? rawFullName : (activity.performedBy && !activity.performedBy.includes('System') ? activity.performedBy : 'Customer');
    const firstName = recipient?.firstName || (cleanFullName.split(' ')[0] && cleanFullName.split(' ')[0] !== 'Customer' ? cleanFullName.split(' ')[0] : cleanFullName);
    const recipientPhone = recipient?.mobile || recipient?.phone || activity.details?.phoneNumber || activity.details?.recipient || '';
    const recipientEmail = recipient?.email || activity.details?.email || '';
    
    let requirement = recipient?.requirement || recipient?.requirementType || '';
    if (!requirement || /^[0-9a-fA-F]{24}$/.test(requirement)) {
        requirement = property?.propertyType || property?.projectName || 'Residential Plot';
    }

    const location = property?.location || recipient?.location || recipient?.locCity || 'Sector 4, Kurukshetra';
    const budget = recipient?.budget || recipient?.budgetMin || recipient?.budgetMax || 'Attractive Price';

    // 2. Agent Normalization
    let agentName = agent?.fullName || agent?.name || '';
    if (!agentName && activity.performedBy && !activity.performedBy.toLowerCase().includes('system')) {
        agentName = activity.performedBy;
    }
    if (!agentName) agentName = 'Bharat Properties Consultant';

    const agentPhone = agent?.mobile || agent?.phone || '+91 94160 35570';
    const agentEmail = agent?.email || 'info@bharatproperties.co';

    // 3. Property Normalization
    const projectName = property?.projectName || 'Kohinoor City';
    const unitNo = property?.unitNo || 'Unit 1';
    const propertyType = property?.propertyType || property?.category || requirement;
    const propertySize = property?.size || '250 Sq. Yd.';
    const propertyPrice = property?.price || 'Attractive Price (On Request)';
    const propertyLink = property?.link || 'https://bharatproperties.co';

    // 4. Activity & Discussion Normalization
    const discussionSummary = activity.details?.summary || activity.details?.discussionSummary || activity.details?.message || activity.subject || 'Discussion held regarding property requirements.';
    const activityDate = activity.dueDate ? new Date(activity.dueDate).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
    const activityTime = activity.dueDate ? new Date(activity.dueDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Convenient Time';

    let result = rawText;

    // Helper map of case-insensitive named replacements
    const namedMap = {
        'agentname': agentName,
        'agent_name': agentName,
        'employeename': agentName,
        'employee_name': agentName,
        'consultantname': agentName,
        
        'agentphone': agentPhone,
        'agent_phone': agentPhone,
        'agentmobile': agentPhone,
        'agent_mobile': agentPhone,
        'employeemobile': agentPhone,
        'employee_mobile': agentPhone,
        
        'agentemail': agentEmail,
        'agent_email': agentEmail,
        'company_name': 'Bharat Properties',
        
        'ownername': cleanFullName,
        'owner_name': cleanFullName,
        'leadname': cleanFullName,
        'lead_name': cleanFullName,
        'customername': cleanFullName,
        'customer_name': cleanFullName,
        'fullname': cleanFullName,
        'full_name': cleanFullName,
        'firstname': firstName,
        'first_name': firstName,
        'name': cleanFullName,
        'phone': recipientPhone,
        'mobile': recipientPhone,
        'email': recipientEmail,
        
        'propertytype': propertyType,
        'property_type': propertyType,
        'property_category': propertyType,
        'subcategory': propertyType,
        'property_subcategory': propertyType,
        'projectname': projectName,
        'project_name': projectName,
        'unitnumber': unitNo,
        'unit_number': unitNo,
        'property_location': location,
        'preferred_city': location,
        'preferred_area': location,
        'property_size': propertySize,
        'size_label': propertySize,
        'property_price': propertyPrice,
        'price': propertyPrice,
        'amount': propertyPrice,
        'budget_max': budget,
        
        'discussionsummary': discussionSummary,
        'discussion_summary': discussionSummary,
        'activity_summary': discussionSummary,
        'activity_location': location || 'Sector 4, Kurukshetra',
        'location': location || 'Sector 4, Kurukshetra',
        'meeting_agenda': discussionSummary,
        'activity_type': activity.type || 'WhatsApp Update',
        'activity_date': activityDate,
        'activity_time': activityTime,
        'due_date': activityDate,
        'lead_status': recipient?.status || 'Active',
        'lead_stage': recipient?.stage || 'Negotiation',
        'intent': property?.intent || property?.primaryDealIntent || recipient?.intent || 'Sell',
        'deal_intent': property?.intent || property?.primaryDealIntent || recipient?.intent || 'Sell',
        'dealintent': property?.intent || property?.primaryDealIntent || recipient?.intent || 'Sell',
        'primarydealintent': property?.intent || property?.primaryDealIntent || recipient?.intent || 'Sell',
        'transaction_type': property?.transactionType || recipient?.transactionType || 'Full White',
        'transactiontype': property?.transactionType || recipient?.transactionType || 'Full White',
        'transactionType': property?.transactionType || recipient?.transactionType || 'Full White',
        'deal_type': property?.dealType || recipient?.dealType || 'Direct',
        'dealtype': property?.dealType || recipient?.dealType || 'Direct',
        'dealType': property?.dealType || recipient?.dealType || 'Direct',
        'document_list': '• Aadhaar Card\n• PAN Card\n• Address Proof'
    };

    // Replace named variables (case-insensitive)
    result = result.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (match, p1) => {
        const key = p1.toLowerCase();
        if (namedMap[key] !== undefined) {
            return namedMap[key];
        }
        return match;
    });

    // Replace numbered placeholders ({{1}}, {{2}}, etc.)
    result = result.replace(/\{\{(\d+)\}\}/g, (match, num) => {
        const n = parseInt(num, 10);
        switch (n) {
            case 1:
                return firstName || cleanFullName;
            case 2:
                // Check if template context is a link or requirement
                if (/view details here:\s*\*?\{\{2\}\}\*?/i.test(rawText) || /check out our new project/i.test(rawText)) {
                    return projectName;
                }
                return requirement;
            case 3:
                return location;
            case 4:
                return propertySize;
            case 5:
                return propertyPrice;
            case 6:
                return agentName;
            case 7:
                return agentPhone;
            default:
                return '-';
        }
    });

    // Cleanse any raw 24-character ObjectIds that might have crept into texts
    result = result.replace(/\b[0-9a-fA-F]{24}\b/g, propertyType);

    // Final Enterprise Pass: Guarantee no raw placeholders remain exposed
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
};

