/**
 * 🌐 Universal Dynamic Variable Resolution Engine
 * Bharat Properties CRM - Enterprise Architecture
 * 
 * Provides 100% unified, dynamic, and fallback-resilient template variable resolution
 * across all channels (WhatsApp Web, WhatsApp Cloud API, SMS, RCS, Email) and
 * all contexts (Deals, Inventory, Leads, Contacts, Projects, Bookings, System).
 * 
 * Guarantees that EVERY variable defined in variableDictionary.js (e.g. intent,
 * transactionType, possessionStatus, furnishing, budget, employee details, etc.)
 * is automatically extracted and populated without requiring manual hardcoded switches.
 */

import { variableDictionary } from '../constants/variableDictionary';

/**
 * Clean up project names to prevent ugly suffixes (e.g. "Sector 3 | Ordinary for Sell" -> "Sector 3")
 */
export function cleanProjectName(val) {
    if (!val) return '';
    let s = typeof val === 'object' ? (val.name || val.title || val.projectName || val.lookup_value || '') : String(val);
    if (!s) return '';
    s = s.split(' | ')[0].trim();
    if (s.includes(' - ') && /(?:sell|sale|rent|ordinary|corner|plot|house|flat|booth|shop|sco)/i.test(s)) {
        s = s.split(' - ')[0].trim();
    }
    s = s.replace(/\s*(?:\||-)?\s*ordinary\s*(?:for\s*)?(?:sell|sale)?/gi, '').trim();
    s = s.replace(/\s*(?:\||-)?\s*(?:for\s*)?(?:sell|sale)$/gi, '').trim();
    return s;
}

/**
 * Clean up property subcategories to remove raw size conversions
 */
export function cleanSubCategory(val) {
    if (!val) return '';
    let s = typeof val === 'object' ? (val.lookup_value || val.name || val.title || val.label || '') : String(val);
    if (!s) return '';
    s = s.replace(/\s*\([^)]*(?:sq|yd|ft|meter|marla|kanal|acre|gaj|bigha|yard|feet|size|\d)[^)]*\)/gi, '');
    s = s.replace(/\s*\b\d+(?:\.\d+)?\s*(?:marla|kanal|acre|sq\.?\s*(?:yd|ft|meter|yard)|feet|gaj|bigha|kila|bhk)\b/gi, '');
    s = s.replace(/\s*\b(?:marla|kanal|acre|sq\.?\s*(?:yd|ft|meter|yard)|feet|gaj|bigha|kila)\b/gi, '');
    s = s.replace(/\s*\(\s*\)/g, '').replace(/[-–—]\s*$/, '').trim();
    return s;
}

/**
 * Format raw numbers or strings into Indian Currency format
 */
export function formatCurrency(val, defaultVal = 'Price on Request') {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'number') {
        if (val >= 10000000) return `₹ ${(val / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
        if (val >= 100000) return `₹ ${(val / 100000).toFixed(2).replace(/\.00$/, '')} Lac`;
        return `₹ ${val.toLocaleString('en-IN')}`;
    }
    if (typeof val === 'string') {
        const cleaned = val.trim();
        if (cleaned.startsWith('₹')) return cleaned;
        if (/Cr|Lakh|Lac|k/i.test(cleaned)) return `₹ ${cleaned}`;
        const num = Number(cleaned.replace(/[^0-9.]/g, ''));
        if (!isNaN(num) && num > 0) return formatCurrency(num, defaultVal);
        return cleaned;
    }
    return defaultVal;
}

/**
 * Safely extracts human-readable text from any raw field value,
 * automatically handling lookups, arrays of lookups, sizes, objects, and dates.
 */
export function extractHumanValue(val, key = '') {
    if (val === undefined || val === null || val === '') return '';

    // 1. Array of values or lookups
    if (Array.isArray(val)) {
        if (val.length === 0) return '';
        const mapped = val.map(item => extractHumanValue(item, key)).filter(Boolean);
        return mapped.join(', ');
    }

    // 2. Object with lookup fields
    if (typeof val === 'object') {
        if (val instanceof Date) {
            return val.toLocaleDateString('en-IN');
        }
        if (val.lookup_value !== undefined && val.lookup_value !== null) {
            return String(val.lookup_value).trim();
        }
        // Size configuration object: { value: 250, unit: 'Sq.Yd.' }
        if (val.value !== undefined) {
            const unit = String(val.unit || '').replace(/\s*\(\s*sq\.?\s*yd\.?\s*\)/gi, '').trim();
            return `${val.value} ${unit}`.trim();
        }
        if (val.fullName) return String(val.fullName).trim();
        if (val.name) return String(val.name).trim();
        if (val.title) return String(val.title).trim();
        if (val.label) return String(val.label).trim();
        if (val.phone || val.mobile) return String(val.phone || val.mobile).trim();
        // If it's a mongo ID or empty object, return blank
        if (val._id && Object.keys(val).length === 1) return '';
        return '';
    }

    // 3. Boolean
    if (typeof val === 'boolean') {
        return val ? 'Yes' : 'No';
    }

    // 4. Number
    if (typeof val === 'number') {
        if (/price|budget|amount|cost/i.test(key)) {
            return formatCurrency(val);
        }
        return String(val);
    }

    // 5. String
    if (typeof val === 'string') {
        let str = val.trim();
        // Check if string is a raw ISO date
        if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
            const d = new Date(str);
            if (!isNaN(d.getTime())) return d.toLocaleDateString('en-IN');
        }
        return str;
    }

    return String(val);
}

/**
 * Universal Variable Resolver
 * Builds a comprehensive, multi-layered dictionary combining Deal, Inventory,
 * Recipient, Staff, System, and Dictionary fields.
 */
export function buildUniversalVariableContext(context = {}) {
    const {
        deal = null,
        singleDeal = deal,
        inventory = null,
        recipient = null,
        lead = null,
        contact = null,
        project = null,
        currentUser = null,
        users = [],
        meta = {},
        singleMeta = meta,
        isMultiDeal = false,
        selectedDeals = [],
        isHtml = false
    } = context;

    const targetDeal = singleDeal || deal || {};
    const inv = inventory || (targetDeal?.inventoryId && typeof targetDeal.inventoryId === 'object' ? targetDeal.inventoryId : {});
    const spec = (targetDeal?.unitSpecification && typeof targetDeal.unitSpecification === 'object')
        ? targetDeal.unitSpecification
        : (inv?.unitSpecification && typeof inv.unitSpecification === 'object' ? inv.unitSpecification : {});
    const targetRecipient = recipient || lead || contact || {};
    const targetProject = project || (targetDeal?.projectId && typeof targetDeal.projectId === 'object' ? targetDeal.projectId : {});

    // 1. Staff & System Assignment
    let assignedUser = null;
    if (targetDeal?.assignedTo && typeof targetDeal.assignedTo === 'object') {
        assignedUser = targetDeal.assignedTo;
    } else if (targetRecipient?.assignedTo && typeof targetRecipient.assignedTo === 'object') {
        assignedUser = targetRecipient.assignedTo;
    } else if ((targetDeal?.assignedTo || targetRecipient?.assignedTo) && Array.isArray(users) && users.length > 0) {
        const uId = String(targetDeal?.assignedTo || targetRecipient?.assignedTo);
        assignedUser = users.find(u => String(u._id || u.id) === uId);
    }
    if (!assignedUser) assignedUser = currentUser;

    const employeeName = extractHumanValue(
        assignedUser?.fullName ||
        assignedUser?.name ||
        (assignedUser?.firstName ? `${assignedUser.firstName} ${assignedUser.lastName || ''}`.trim() : '') ||
        currentUser?.fullName ||
        currentUser?.name,
        'employeeName'
    ) || 'Bharat Properties';

    const employeeMobile = extractHumanValue(
        assignedUser?.mobile ||
        assignedUser?.phone ||
        currentUser?.mobile ||
        currentUser?.phone,
        'employeeMobile'
    ) || '+91 9991333570';

    const employeeEmail = extractHumanValue(
        assignedUser?.email ||
        currentUser?.email,
        'employeeEmail'
    ) || 'deals@bharatproperties.co';

    const assignedTeam = extractHumanValue(
        targetDeal?.team ||
        targetRecipient?.team ||
        assignedUser?.team ||
        currentUser?.team,
        'team'
    ) || 'Sales Team';

    const assignedVisibility = extractHumanValue(
        targetDeal?.visibleTo ||
        targetDeal?.visibility ||
        targetRecipient?.visibleTo,
        'visibleTo'
    ) || 'Everyone';

    // 2. Customer / Recipient
    const rawRecipientName = extractHumanValue(
        targetRecipient?.fullName ||
        targetRecipient?.name ||
        (targetRecipient?.firstName ? `${targetRecipient.firstName} ${targetRecipient.lastName || targetRecipient.surname || ''}`.trim() : ''),
        'name'
    );
    const recipientName = rawRecipientName && !/^[0-9a-fA-F]{24}$/.test(rawRecipientName) ? rawRecipientName : 'Valued Client';
    const recipientFirstName = extractHumanValue(
        targetRecipient?.firstName ||
        (recipientName.split(' ')[0] && recipientName.split(' ')[0] !== 'Valued' ? recipientName.split(' ')[0] : recipientName),
        'firstName'
    ) || recipientName;
    const recipientMobile = extractHumanValue(
        targetRecipient?.mobile ||
        targetRecipient?.phone ||
        targetRecipient?.phoneNumber,
        'mobile'
    );
    const recipientEmail = extractHumanValue(targetRecipient?.email, 'email');

    // 3. Property & Deal Details
    const rawTitle = targetDeal?.projectName || inv?.projectName || targetProject?.name || singleMeta?.projectName || singleMeta?.title || targetDeal?.title || '';
    const dealTitle = cleanProjectName(rawTitle) || 'Featured Deal';

    const rawSubCat = targetDeal?.subCategory || spec?.subCategory || inv?.subCategory || targetDeal?.propertyType || '';
    const dealSubCategory = cleanSubCategory(rawSubCat) || 'Plot';

    const dealCategory = extractHumanValue(
        targetDeal?.category || spec?.category || inv?.category || targetDeal?.propertyType,
        'category'
    ) || 'Residential';

    const dealDirection = extractHumanValue(
        targetDeal?.direction || spec?.direction || inv?.direction || inv?.orientation || spec?.orientation,
        'direction'
    );

    const dealRoadWidth = extractHumanValue(
        targetDeal?.roadWidth || spec?.roadWidth || inv?.roadWidth,
        'roadWidth'
    );

    const dealFacing = extractHumanValue(
        targetDeal?.facing || spec?.facing || inv?.facing,
        'facing'
    );

    const dealBuiltupType = extractHumanValue(
        targetDeal?.builtupType || spec?.builtupType || inv?.builtupType,
        'builtupType'
    );

    const dealUnitType = extractHumanValue(
        targetDeal?.unitType || spec?.unitType || inv?.unitType || dealBuiltupType,
        'unitType'
    );

    const dealBlock = extractHumanValue(targetDeal?.block || inv?.block, 'block');
    const dealUnitNo = extractHumanValue(targetDeal?.unitNo || targetDeal?.unitNumber || inv?.unitNumber || inv?.unitNo, 'unitNo');

    // Size Specs
    let dealSize = '';
    if (targetDeal?.size && typeof targetDeal.size === 'object') {
        dealSize = extractHumanValue(targetDeal.size, 'size');
    } else if (targetDeal?.size) {
        dealSize = String(targetDeal.size).trim();
    } else if (inv?.size) {
        dealSize = extractHumanValue(inv.size, 'size');
    }
    const dealSizeType = extractHumanValue(
        targetDeal?.sizeType ||
        inv?.sizeType ||
        targetDeal?.sizeLabel ||
        inv?.sizeLabel ||
        spec?.sizeLabel,
        'sizeType'
    );
    let dealFullSpecs = '';
    if (dealSizeType && dealSize) {
        const cleanS = dealSize.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanT = dealSizeType.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanT.includes(cleanS)) dealFullSpecs = dealSizeType;
        else if (cleanS.includes(cleanT)) dealFullSpecs = dealSize;
        else dealFullSpecs = `${dealSize} (${dealSizeType})`;
    } else {
        dealFullSpecs = dealSizeType || dealSize || extractHumanValue(singleMeta?.features?.[0], 'features') || '';
    }

    // Price
    const rawPrice = targetDeal?.price || targetDeal?.quotePrice || targetDeal?.value || inv?.price || singleMeta?.price;
    const dealPrice = formatCurrency(rawPrice, 'Price on Request');

    const dealLoc = extractHumanValue(
        singleMeta?.location || targetDeal?.location || inv?.location || targetRecipient?.locArea || targetRecipient?.locCity,
        'location'
    ) || 'Sector 3, Kurukshetra';

    const dealRef = extractHumanValue(
        targetDeal?.dealCode || targetDeal?.dealId || targetDeal?.shareableId,
        'dealCode'
    ) || (targetDeal?._id ? String(targetDeal._id).slice(-6).toUpperCase() : 'DEAL-REF');

    // Intent (Sell / Rent / Lease)
    const rawIntent = targetDeal?.intent ||
        targetDeal?.primaryDealIntent ||
        inv?.intent ||
        inv?.primaryDealIntent ||
        spec?.intent ||
        targetDeal?.type ||
        targetDeal?.dealType ||
        targetRecipient?.intent ||
        'Sell';
    const dealIntent = extractHumanValue(rawIntent, 'intent') || 'Sell';

    // Transaction Type (Full White / Collector Rate / Flexible)
    const rawTransactionType = targetDeal?.transactionType ||
        targetDeal?.transaction_type ||
        inv?.transactionType ||
        spec?.transactionType ||
        targetRecipient?.transactionType ||
        'Full White';
    const dealTransactionType = extractHumanValue(rawTransactionType, 'transactionType') || 'Full White';

    // Summary multi-deal list representation
    let propertyList = '';
    if (isMultiDeal && selectedDeals.length > 0) {
        if (isHtml) {
            propertyList = `<div style="margin: 10px 0; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">` +
                selectedDeals.map((d, i) => {
                    const pTitle = cleanProjectName(d.projectName || d.title) || 'Deal';
                    const pLoc = extractHumanValue(d.location, 'location') || 'Kurukshetra';
                    const pPrice = d.price ? formatCurrency(d.price) : 'P.O.R';
                    return `<div style="padding: 6px 0; border-bottom: ${i < selectedDeals.length - 1 ? '1px dashed #cbd5e1' : 'none'};"><strong>${i + 1}. 🏢 ${pTitle}</strong> — <span style="color:#10b981;font-weight:700;">${pPrice}</span> • 📍 ${pLoc}</div>`;
                }).join('') + `</div>`;
        } else {
            propertyList = selectedDeals.map((d, i) => {
                const pTitle = cleanProjectName(d.projectName || d.title) || 'Deal';
                const pLoc = extractHumanValue(d.location, 'location') || 'Kurukshetra';
                const pPrice = d.price ? formatCurrency(d.price) : 'P.O.R';
                return `${i + 1}️⃣ 🏢 *${pTitle}* | 💰 ${pPrice} | 📍 ${pLoc}`;
            }).join('\n');
        }
    } else {
        if (isHtml) {
            propertyList = `<div style="margin: 10px 0; padding: 12px; background: #f8fafc; border-left: 4px solid #4f46e5; border-radius: 6px;">` +
                `<div><strong>🏢 ${dealTitle}</strong></div>` +
                `<div>📍 Location: ${dealLoc}</div>` +
                `<div>💰 Price: <strong style="color:#10b981;">${dealPrice}</strong></div>` +
                `<div>📐 Specs: ${dealFullSpecs}</div>` +
                `</div>`;
        } else {
            propertyList = `🏢 *${dealTitle}*\n📍 ${dealLoc}\n💰 ${dealPrice}\n📐 ${dealFullSpecs}`;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 🗺️ MASTER UNIFIED CANONICAL VARIABLE DICTIONARY
    // ─────────────────────────────────────────────────────────────
    const masterDict = {
        // Customer / Lead
        customer_name: recipientName,
        customername: recipientName,
        first_name: recipientFirstName,
        firstname: recipientFirstName,
        full_name: recipientName,
        fullname: recipientName,
        name: recipientName,
        last_name: extractHumanValue(targetRecipient?.surname || targetRecipient?.lastName, 'surname'),
        surname: extractHumanValue(targetRecipient?.surname || targetRecipient?.lastName, 'surname'),
        mobile: recipientMobile,
        phone: recipientMobile,
        email: recipientEmail,
        lead_source: extractHumanValue(targetRecipient?.source || targetRecipient?.leadSource, 'source') || 'Direct',
        source: extractHumanValue(targetRecipient?.source || targetDeal?.source, 'source') || 'Direct',
        lead_status: extractHumanValue(targetRecipient?.status || targetRecipient?.stage, 'status') || 'Active',
        lead_stage: extractHumanValue(targetRecipient?.stage || targetDeal?.stage, 'stage') || 'Active',
        stage: extractHumanValue(targetDeal?.stage || targetRecipient?.stage, 'stage') || 'Active',
        lead_requirement: extractHumanValue(targetRecipient?.requirement || targetRecipient?.requirementType, 'requirement') || dealFullSpecs || 'Property',
        requirement: extractHumanValue(targetRecipient?.requirement || targetRecipient?.requirementType, 'requirement') || dealFullSpecs || 'Property',
        purpose: extractHumanValue(targetRecipient?.purpose, 'purpose') || 'End Use',
        budget_min: formatCurrency(targetRecipient?.budgetMin || targetRecipient?.budget, ''),
        budget_max: formatCurrency(targetRecipient?.budgetMax, ''),
        budgetMin: formatCurrency(targetRecipient?.budgetMin || targetRecipient?.budget, ''),
        budgetMax: formatCurrency(targetRecipient?.budgetMax, ''),
        budget: formatCurrency(targetRecipient?.budgetMax || targetRecipient?.budgetMin || targetRecipient?.budget, dealPrice),
        preferred_city: extractHumanValue(targetRecipient?.locCity || targetRecipient?.city, 'city') || 'Kurukshetra',
        preferred_area: extractHumanValue(targetRecipient?.locArea || targetRecipient?.area, 'area') || 'Sector 3',
        locCity: extractHumanValue(targetRecipient?.locCity, 'locCity') || 'Kurukshetra',
        locArea: extractHumanValue(targetRecipient?.locArea, 'locArea') || 'Sector 3',
        locBlock: extractHumanValue(targetRecipient?.locBlock, 'locBlock') || '',
        locPinCode: extractHumanValue(targetRecipient?.locPinCode, 'locPinCode') || '',
        timeline: extractHumanValue(targetRecipient?.timeline, 'timeline') || 'Immediate',
        funding: extractHumanValue(targetRecipient?.funding, 'funding') || 'Self Funded',
        furnishing: extractHumanValue(targetRecipient?.furnishing || inv?.furnishType, 'furnishing') || 'Unfurnished',
        furnishType: extractHumanValue(inv?.furnishType || targetRecipient?.furnishing, 'furnishType') || 'Unfurnished',
        nri: extractHumanValue(targetRecipient?.nri, 'nri') || 'No',

        // Deal & Intent
        intent: dealIntent,
        deal_intent: dealIntent,
        primaryDealIntent: dealIntent,
        transactionType: dealTransactionType,
        transaction_type: dealTransactionType,
        transactiontype: dealTransactionType,
        dealType: extractHumanValue(targetDeal?.dealType || dealTransactionType, 'dealType') || 'Direct',
        deal_type: extractHumanValue(targetDeal?.dealType || dealTransactionType, 'dealType') || 'Direct',
        dealCode: dealRef,
        dealcode: dealRef,
        deal_code: dealRef,
        ref: dealRef,
        shareableId: dealRef,

        // Property / Inventory
        project_name: dealTitle,
        projectname: dealTitle,
        projectName: dealTitle,
        property_title: dealTitle,
        propertytitle: dealTitle,
        title: dealTitle,
        unit_number: dealUnitNo || dealRef,
        unitnumber: dealUnitNo || dealRef,
        unitNo: dealUnitNo || dealRef,
        unitno: dealUnitNo || dealRef,
        unit: dealUnitNo || dealRef,
        block_name: dealBlock,
        block: dealBlock,
        unit_type: dealUnitType,
        unitType: dealUnitType,
        property_category: dealCategory,
        propertycategory: dealCategory,
        category: dealCategory,
        property_subcategory: dealSubCategory,
        propertysubcategory: dealSubCategory,
        subcategory: dealSubCategory,
        subCategory: dealSubCategory,
        builtup_type: dealBuiltupType,
        builtupType: dealBuiltupType,
        builtuptype: dealBuiltupType,
        property_size: dealFullSpecs,
        size_label: dealFullSpecs,
        sizelabel: dealFullSpecs,
        size_type: dealFullSpecs,
        sizeType: dealFullSpecs,
        sizetype: dealFullSpecs,
        size: dealFullSpecs,
        specs: dealFullSpecs,
        property_direction: dealDirection,
        propertydirection: dealDirection,
        direction: dealDirection,
        property_facing: dealFacing,
        propertyfacing: dealFacing,
        facing: dealFacing,
        road_width: dealRoadWidth,
        roadwidth: dealRoadWidth,
        roadWidth: dealRoadWidth,
        road: dealRoadWidth,
        property_price: dealPrice,
        propertyprice: dealPrice,
        price: dealPrice,
        amount: dealPrice,
        property_location: dealLoc,
        propertylocation: dealLoc,
        location: dealLoc,
        sector: dealLoc,
        city: extractHumanValue(inv?.address?.city || targetDeal?.city, 'city') || 'Kurukshetra',
        state: extractHumanValue(inv?.address?.state || targetDeal?.state, 'state') || 'Haryana',
        pincode: extractHumanValue(inv?.address?.pincode || targetDeal?.pincode, 'pincode') || '136118',
        ownership: extractHumanValue(inv?.ownership || targetDeal?.ownership, 'ownership') || 'Freehold',
        possessionStatus: extractHumanValue(inv?.possessionStatus || targetDeal?.possessionStatus, 'possessionStatus') || 'Ready to Move',
        possession_status: extractHumanValue(inv?.possessionStatus || targetDeal?.possessionStatus, 'possessionStatus') || 'Ready to Move',
        ageOfConstruction: extractHumanValue(inv?.ageOfConstruction || targetDeal?.ageOfConstruction, 'ageOfConstruction') || 'New',
        occupationDate: extractHumanValue(inv?.occupationDate || targetDeal?.occupationDate, 'occupationDate') || 'Ready',

        // Project Info
        developerName: extractHumanValue(targetProject?.developerName, 'developerName') || 'Reputed Developer',
        reraNumber: extractHumanValue(targetProject?.reraNumber, 'reraNumber') || 'RERA Approved',
        totalFloors: extractHumanValue(targetProject?.totalFloors || inv?.totalFloors, 'totalFloors') || '',
        totalUnits: extractHumanValue(targetProject?.totalUnits, 'totalUnits') || '',
        parkingType: extractHumanValue(targetProject?.parkingType || inv?.parkingType, 'parkingType') || 'Covered',

        // Booking Info
        totalDealAmount: formatCurrency(targetDeal?.totalDealAmount || targetDeal?.price, dealPrice),
        tokenAmount: formatCurrency(targetDeal?.tokenAmount, 'On Discussion'),
        agreementAmount: formatCurrency(targetDeal?.agreementAmount, 'On Agreement'),
        bookingDate: extractHumanValue(targetDeal?.bookingDate, 'bookingDate') || 'Recent',

        // System & Staff Assignment
        EmployeeName: employeeName,
        employeeName: employeeName,
        employee_name: employeeName,
        employeename: employeeName,
        EmployeeMobile: employeeMobile,
        employeeMobile: employeeMobile,
        employee_mobile: employeeMobile,
        employeemobile: employeeMobile,
        agent_name: employeeName,
        agentname: employeeName,
        agentName: employeeName,
        agent_mobile: employeeMobile,
        agentmobile: employeeMobile,
        agentMobile: employeeMobile,
        agent_phone: employeeMobile,
        agentphone: employeeMobile,
        agent_email: employeeEmail,
        agentemail: employeeEmail,
        employee_email: employeeEmail,
        EmployeeEmail: employeeEmail,
        team: assignedTeam,
        team_name: assignedTeam,
        teamName: assignedTeam,
        assignedTo: employeeName,
        assignedto: employeeName,
        assigneduser: employeeName,
        visibleTo: assignedVisibility,
        visibleto: assignedVisibility,
        company_name: 'Bharat Properties',
        companyname: 'Bharat Properties',

        // Feedback / Activity Updates
        OwnerName: extractHumanValue(targetDeal?.ownerName || inv?.ownerName || targetRecipient?.name, 'ownerName') || 'Property Owner',
        ownerName: extractHumanValue(targetDeal?.ownerName || inv?.ownerName || targetRecipient?.name, 'ownerName') || 'Property Owner',
        ownerMobile: extractHumanValue(targetDeal?.ownerMobile || inv?.ownerMobile, 'ownerMobile') || employeeMobile,
        ownermobile: extractHumanValue(targetDeal?.ownerMobile || inv?.ownerMobile, 'ownerMobile') || employeeMobile,
        unitnumber: dealUnitNo || dealRef,
        projectname: dealTitle,
        DiscussionSummary: 'Client verified property specifications and location.',
        discussionsummary: 'Client verified property specifications and location.',

        // Dynamic / Matches
        property_list: propertyList,
        property_list_default: propertyList,
        property_list_dtl: propertyList,
        property_list_detailed: propertyList,
        matchListDefault: propertyList,
        matchListDetailed: propertyList,
        requirement_summary: `${dealFullSpecs || dealSubCategory} in ${dealLoc}`,
        properties_count: String(isMultiDeal ? selectedDeals.length : 1),
        match_percentage: '98',
        due_date: 'This Weekend',
        document_list: '• Aadhaar Card\n• PAN Card\n• Booking Cheque / Receipt'
    };

    // 4. Dynamic Auto-Ingestion of ALL fields from variableDictionary
    // Any field declared in variableDictionary that was not explicitly defined above
    // is dynamically resolved by inspecting targetDeal, inv, spec, targetRecipient, and targetProject.
    variableDictionary.forEach(entry => {
        const id = entry.id;
        if (!masterDict[id]) {
            // Check entities in priority order: Deal -> Inventory -> Spec -> Recipient -> Project
            let val = targetDeal[id];
            if (val === undefined || val === null || val === '') val = inv[id];
            if (val === undefined || val === null || val === '') val = spec[id];
            if (val === undefined || val === null || val === '') val = targetRecipient[id];
            if (val === undefined || val === null || val === '') val = targetProject[id];

            // If it's dot notation like address.city
            if ((val === undefined || val === null || val === '') && id.includes('.')) {
                const parts = id.split('.');
                let currDeal = targetDeal;
                let currInv = inv;
                let currRec = targetRecipient;
                for (const p of parts) {
                    currDeal = currDeal ? currDeal[p] : undefined;
                    currInv = currInv ? currInv[p] : undefined;
                    currRec = currRec ? currRec[p] : undefined;
                }
                val = currDeal !== undefined ? currDeal : (currInv !== undefined ? currInv : currRec);
            }

            const humanVal = extractHumanValue(val, id);
            if (humanVal) {
                masterDict[id] = humanVal;
                // Also index lowercased and stripped variants
                const stripped = id.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (!masterDict[stripped]) masterDict[stripped] = humanVal;
            }
        }
    });

    return masterDict;
}

/**
 * Universal Template String Interpolation Engine
 * 
 * Replaces any {{variable}} inside rawText using the full universal variable engine.
 * Supports:
 * - Direct matches ({{intent}}, {{price}}, {{EmployeeName}})
 * - Fuzzy/Case-insensitive matches ({{INTENT}}, {{transaction_type}}, {{transactiontype}})
 * - Numbered placeholders ({{1}}, {{2}}, etc.)
 * - Bracketed legacy placeholders ([Recipient Name], [Broker Name], etc.)
 */
export function resolveAllTemplateVariables(rawText, context = {}) {
    if (!rawText || typeof rawText !== 'string') return rawText || '';

    const varMap = buildUniversalVariableContext(context);

    let result = rawText;

    // 1. Bracketed placeholders
    const recName = varMap.customer_name || 'Valued Client';
    result = result
        .replace(/\[Recipient \/ Broker Name\]/gi, recName)
        .replace(/\[Recipient \/ Group\]/gi, recName)
        .replace(/\[Broker Name\]/gi, recName)
        .replace(/\[Recipient Name\]/gi, recName);

    // 2. Named Variables: {{variableKey}}
    result = result.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, rawKey) => {
        const cleanKey = rawKey.trim();

        // Check exact match
        if (varMap[cleanKey] !== undefined && varMap[cleanKey] !== '') {
            return String(varMap[cleanKey]);
        }

        // Check lowercase match
        const lower = cleanKey.toLowerCase();
        if (varMap[lower] !== undefined && varMap[lower] !== '') {
            return String(varMap[lower]);
        }

        // Check normalized alphanumeric match (stripping underscores, hyphens, dots)
        const stripped = lower.replace(/[^a-z0-9]/g, '');
        if (varMap[stripped] !== undefined && varMap[stripped] !== '') {
            return String(varMap[stripped]);
        }

        // Positional fallback if number inside {{1}}, {{2}}
        if (/^\d+$/.test(cleanKey)) {
            const n = parseInt(cleanKey, 10);
            switch (n) {
                case 1: return varMap.first_name || recName;
                case 2: return varMap.property_list_default || varMap.projectName || '';
                case 3: return varMap.property_price || '';
                case 4: return varMap.property_location || '';
                case 5: return varMap.size_label || varMap.property_size || '';
                case 6: return varMap.EmployeeName || 'Bharat Properties';
                case 7: return varMap.EmployeeMobile || '+91 9991333570';
                default: return match;
            }
        }

        // If unknown or unresolved, return match (to avoid swallowing variables)
        return match;
    });

    return result;
}

export default {
    cleanProjectName,
    cleanSubCategory,
    formatCurrency,
    extractHumanValue,
    buildUniversalVariableContext,
    resolveAllTemplateVariables
};
