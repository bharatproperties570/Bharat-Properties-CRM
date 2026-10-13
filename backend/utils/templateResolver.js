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
        'property_list_dtl': propertyListDetailed,   // ✅ Alias: renamed for Meta 20-char limit
        'requirement_summary': (recipient?.requirement || recipient?.requirementType) ? `Looking for ${recipient?.requirement || recipient?.requirementType} in ${locationResolved || recipient?.location || 'our area'} budget ${recipient?.budgetMin || recipient?.budget || ''}` : 'Your property requirement',
        'properties_count': properties?.length || 0,
        
        'customer_name': recipient?.firstName || recipient?.name?.split(' ')[0] || 'customer',
        'full_name': recipient?.name || recipient?.firstName || 'customer',      // ✅ common named var
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
        'intent': recipient?.intent || 'High',
        'transaction_type': 'Purchase',
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

