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

export const resolveMessageTemplate = async (template, channel, recipient, properties, currentUser) => {
    let resolvedBody = '';
    const components = [];
    const lookupsCache = {};

    // Get variable registry from system settings
    let variableRegistry = {};
    try {
        const regSetting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
        if (regSetting && regSetting.value) {
            variableRegistry = regSetting.value;
        }
    } catch (err) {
        console.error('Failed to fetch messaging variable registry', err);
    }

    const getPropVal = (key) => {
        if (!properties || properties.length === 0) return '';
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
        return val !== undefined && val !== null ? val : '';
    };

    const categoryRaw = getPropVal('category') || getPropVal('propertyType');
    const categoryResolved = await resolveLookup(categoryRaw, 'Category', lookupsCache);

    const subCategoryRaw = getPropVal('subCategory');
    const subCategoryResolved = await resolveLookup(subCategoryRaw, 'SubCategory', lookupsCache);

    const builtupTypeRaw = getPropVal('builtupType');
    const builtupTypeResolved = builtupTypeRaw && !/^[0-9a-fA-F]{24}$/.test(String(builtupTypeRaw))
        ? builtupTypeRaw
        : await resolveLookup(builtupTypeRaw, 'BuiltupType', lookupsCache);

    const sizeLabelRaw = getPropVal('sizeLabel') || getPropVal('sizeConfig');
    const sizeLabelResolved = (sizeLabelRaw && !/^[0-9a-fA-F]{24}$/.test(String(sizeLabelRaw)))
        ? sizeLabelRaw
        : (await resolveLookup(sizeLabelRaw, 'Size', lookupsCache) || getPropVal('size'));

    const directionRaw = getPropVal('direction');
    const directionResolved = directionRaw && !/^[0-9a-fA-F]{24}$/.test(String(directionRaw))
        ? directionRaw
        : await resolveLookup(directionRaw, 'Direction', lookupsCache);

    const facingRaw = getPropVal('facing');
    const facingResolved = facingRaw && !/^[0-9a-fA-F]{24}$/.test(String(facingRaw))
        ? facingRaw
        : await resolveLookup(facingRaw, 'Facing', lookupsCache);

    const roadWidthRaw = getPropVal('roadWidth');
    const roadWidthResolved = roadWidthRaw && !/^[0-9a-fA-F]{24}$/.test(String(roadWidthRaw))
        ? roadWidthRaw
        : await resolveLookup(roadWidthRaw, 'RoadWidth', lookupsCache);

    const sizeRaw = getPropVal('size');
    const sizeVal = typeof sizeRaw === 'object' ? (sizeRaw.value ? `${sizeRaw.value} ${sizeRaw.unit || 'Sq.Yd.'}` : '') : sizeRaw;

    const priceVal = getPropVal('price');
    const projectNameVal = getPropVal('projectName') || getPropVal('unitNo') || 'Premium Listing';

    const locationRaw = getPropVal('location') || getPropVal('city') || getPropVal('sector');
    const locationResolved = await resolveLookup(locationRaw, 'Location', lookupsCache) || locationRaw;

    let propertyListDefault = '';
    let propertyListDetailed = '';
    
    if (properties && properties.length > 0) {
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
            propertyListDefault += `${i + 1}️⃣ ${propVal('unitNo') || 'Unit'} - ${resolvedLoc}\n`;
            
            const szRaw = propVal('size');
            const szVal = typeof szRaw === 'object' ? (szRaw.value ? `${szRaw.value} ${szRaw.unit || 'Sq.Yd.'}` : '') : szRaw;
            propertyListDetailed += `${i + 1}️⃣ 📍 ${resolvedLoc}\n📏 Size: ${szVal}\n💰 Price: ₹${propVal('price') || ''}\n`;
        }
        propertyListDefault = propertyListDefault.trim();
        propertyListDetailed = propertyListDetailed.trim();
    }

    const agentName = recipient?.assignedTo?.name || recipient?.owner || recipient?.agentName || currentUser?.name || 'Our Representative';
    const agentMobile = recipient?.assignment?.assignedTo?.mobile || recipient?.assignedTo?.mobile || recipient?.ownerMobile || recipient?.agentMobile || currentUser?.mobile || currentUser?.phone || '';
    const agentDetails = agentMobile ? `${agentName} (📞 ${agentMobile})` : agentName;

    const unifiedContext = {
        'name': recipient?.name,
        'firstName': recipient?.firstName || recipient?.name?.split(' ')[0] || 'customer',
        'surname': recipient?.surname || '',
        'mobile': recipient?.phone || recipient?.mobile || '',
        'email': recipient?.email || '',
        'source': recipient?.source || '',
        'status': recipient?.status || recipient?.stage || '',
        'requirement': recipient?.requirement || recipient?.requirementType || 'property',
        'budgetMin': recipient?.budgetMin || recipient?.budget || '',
        'budgetMax': recipient?.budgetMax || '',
        'areaMin': recipient?.areaMin || '',
        'areaMax': recipient?.areaMax || '',
        'locCity': recipient?.locCity || recipient?.location || '',
        'locArea': recipient?.locArea || '',
        
        'assignedTo': agentDetails,
        'ownerMobile': agentMobile,
        'ownerEmail': recipient?.assignedTo?.email || currentUser?.email || '',

        'projectName': projectNameVal,
        'unitNo': getPropVal('unitNo'),
        'block': getPropVal('block'),
        'unitType': await resolveLookup(getPropVal('unitType'), 'UnitType', lookupsCache),
        'category': categoryResolved,
        'subCategory': subCategoryResolved,
        'builtupType': builtupTypeResolved,
        'sizeType': sizeLabelResolved,
        'sizeLabel': sizeLabelResolved,
        'direction': directionResolved,
        'facing': facingResolved,
        'roadWidth': roadWidthResolved,
        'price': priceVal || 'N/A',
        'size': sizeVal || 'N/A',
        'location': locationResolved || recipient?.location || 'our project',
        
        'propertyList': propertyListDefault,
        'property_list_default': propertyListDefault,
        'property_list_detailed': propertyListDetailed,
        'requirementSummary': (recipient?.requirement || recipient?.requirementType) ? `Looking for ${recipient?.requirement || recipient?.requirementType} in ${locationResolved || recipient?.location || 'our area'} budget ${recipient?.budgetMin || recipient?.budget || ''}` : 'Your property requirement',
        'propertiesCount': properties?.length || 0,
        
        'customer_name': recipient?.firstName || recipient?.name?.split(' ')[0] || 'customer'
    };

    const seen = new Set();
    const resolveVars = (text) => {
        if (!text) return text;
        return text.replace(/{{([^}]+)}}/g, (match, vIdx) => {
            const cleanKey = vIdx.trim();
            
            // DLT Index-based mapping
            if (/^\d+$/.test(cleanKey)) {
                const defaultRegistry = {
                    '1': 'customer_name',
                    '2': 'property_list_default',
                    '3': 'assignedTo'
                };
                const mappedField = variableRegistry[cleanKey] || variableRegistry[String(cleanKey)] || defaultRegistry[String(cleanKey)];
                const val = unifiedContext[mappedField] !== undefined ? renderValue(unifiedContext[mappedField], '') : match;
                if (!seen.has(cleanKey)) {
                    components.push({ type: 'text', text: val });
                    seen.add(cleanKey);
                }
                return val;
            }
            
            // Standardized Named Variables
            if (unifiedContext[cleanKey] !== undefined) {
                const val = renderValue(unifiedContext[cleanKey], '');
                if (!seen.has(cleanKey)) {
                    components.push({ type: 'text', text: val });
                    seen.add(cleanKey);
                }
                return val;
            }
            
            // Fallbacks for specific legacy/hardcoded strings
            const legacyHardcoded = {
                'MatchCount': 'several',
                'OldPrice': 'N/A',
                'NewPrice': 'N/A',
                'Savings': 'N/A',
                'Deadline': 'tomorrow',
                'Amount': 'the due amount',
                'DueDate': 'the due date',
                'PaymentType': 'payment',
                'PaymentMethods': 'Bank Transfer / UPI',
                'MatchPercentage': '95',
                'MatchReasons': '- Matches your budget\n- Preferred location\n- Right size',
                'CompetingBuyers': '2',
                'Slot1': 'Tomorrow 10 AM',
                'Slot2': 'Tomorrow 2 PM',
                'Slot3': 'Day after 11 AM',
                'PositiveFeedback': 'Location, Amenities',
                'Concerns': 'Price negotiation',
                'NextSteps': 'I will share a revised offer',
                'DocumentList': '- Aadhaar Card\n- PAN Card\n- Cancelled Cheque'
            };
            
            if (legacyHardcoded[cleanKey] !== undefined) {
                const val = renderValue(legacyHardcoded[cleanKey], '');
                if (!seen.has(cleanKey)) {
                    components.push({ type: 'text', text: val });
                    seen.add(cleanKey);
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
        
        resolvedBody = resolvedBody.replace(/{{Name}}/g, recipient?.name || 'valued customer');
        resolvedBody = resolvedBody.replace(/{{FirstName}}/g, recipient?.firstName || recipient?.name?.split(' ')[0] || 'valued customer');
        resolvedBody = resolvedBody.replace(/{{Phone}}/g, recipient?.phone || 'your phone');

        // SAFETY FILTER: Strip any surviving raw MongoDB ObjectIds (24-char hex)
        resolvedBody = resolvedBody.replace(/\b[0-9a-fA-F]{24}\b/g, '');
    }

    return {
        resolvedBody,
        components,
        language: template.language || 'en_US',
        rcsTitle: channel === 'RCS' ? (template.name || '') : undefined,
        rcsActions: channel === 'RCS' ? (template.buttons || []) : undefined
    };
};
