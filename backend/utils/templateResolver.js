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
        // Customer / Lead Data
        'full_name': recipient?.name || '',
        'first_name': recipient?.firstName || recipient?.name?.split(' ')[0] || 'customer',
        'last_name': recipient?.surname || recipient?.lastName || '',
        'mobile': recipient?.phone || recipient?.mobile || '',
        'email': recipient?.email || '',
        'lead_source': recipient?.source || '',
        'lead_status': recipient?.status || recipient?.stage || '',
        'lead_stage': recipient?.stage || recipient?.status || '',
        'lead_requirement': recipient?.requirement || recipient?.requirementType || 'property',
        'budget_min': recipient?.budgetMin || recipient?.budget || '',
        'budget_max': recipient?.budgetMax || '',
        'preferred_city': recipient?.locCity || recipient?.location || '',
        'preferred_area': recipient?.locArea || '',
        
        // Agent / System Data
        'agent_name': agentName || '',
        'agent_mobile': agentMobile || '',
        'agent_email': recipient?.assignedTo?.email || currentUser?.email || '',
        'company_name': 'Bharat Properties', // Hardcoded or from env

        // Property Data
        'project_name': projectNameVal,
        'unit_number': getPropVal('unitNo'),
        'block_name': getPropVal('block'),
        'unit_type': await resolveLookup(getPropVal('unitType'), 'UnitType', lookupsCache),
        'property_category': categoryResolved,
        'property_subcategory': subCategoryResolved,
        'builtup_type': builtupTypeResolved,
        'size_label': sizeLabelResolved,
        'property_direction': directionResolved,
        'property_facing': facingResolved,
        'road_width': roadWidthResolved,
        'property_price': priceVal || 'N/A',
        'property_size': sizeVal || 'N/A',
        'property_location': locationResolved || recipient?.location || 'our project',
        
        // Dynamic / Match Data
        'property_list': propertyListDefault,
        'property_list_default': propertyListDefault,
        'property_list_detailed': propertyListDetailed,
        'requirement_summary': (recipient?.requirement || recipient?.requirementType) ? `Looking for ${recipient?.requirement || recipient?.requirementType} in ${locationResolved || recipient?.location || 'our area'} budget ${recipient?.budgetMin || recipient?.budget || ''}` : 'Your property requirement',
        'properties_count': properties?.length || 0,
        
        'customer_name': recipient?.firstName || recipient?.name?.split(' ')[0] || 'customer',
        'match_percentage': '95'
    };

    const seen = new Set();
    const resolveVars = (text) => {
        if (!text) return text;
        return text.replace(/{{([^}]+)}}/g, (match, vIdx) => {
            const cleanKey = vIdx.trim();
            
            // Standardized Named Variables
            if (unifiedContext[cleanKey] !== undefined) {
                const val = renderValue(unifiedContext[cleanKey], '');
                if (!seen.has(cleanKey)) {
                    components.push({ type: 'text', parameter_name: cleanKey, text: val });
                    seen.add(cleanKey);
                }
                return val;
            }
            
            // Fallbacks for specific legacy/hardcoded strings
            const legacyHardcoded = {
                'match_count': 'several',
                'old_price': 'N/A',
                'new_price': 'N/A',
                'savings': 'N/A',
                'deadline': 'tomorrow',
                'amount': 'the due amount',
                'due_date': 'the due date',
                'payment_type': 'payment',
                'payment_methods': 'Bank Transfer / UPI',
                'match_percentage': '95',
                'match_reasons': '- Matches your budget\n- Preferred location\n- Right size',
                'competing_buyers': '2',
                'slot_1': 'Tomorrow 10 AM',
                'slot_2': 'Tomorrow 2 PM',
                'slot_3': 'Day after 11 AM',
                'positive_feedback': 'Location, Amenities',
                'concerns': 'Price negotiation',
                'next_steps': 'I will share a revised offer',
                'document_list': '- Aadhaar Card\n- PAN Card\n- Cancelled Cheque'
            };
            
            if (legacyHardcoded[cleanKey] !== undefined) {
                const val = renderValue(legacyHardcoded[cleanKey], '');
                if (!seen.has(cleanKey)) {
                    components.push({ type: 'text', parameter_name: cleanKey, text: val });
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
