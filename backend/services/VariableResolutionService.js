/**
 * VariableResolutionService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * "Enterprise Grade" Dynamic Variable Resolver.
 * Resolves indices like {{1}}, {{2}}... based on a mapping registry
 * and source data (Lead, Deal, Inventory).
 */

import jwt from 'jsonwebtoken';

class VariableResolutionService {
    /**
     * LAYER 1: Named Resolution (Internal)
     * Resolves all CRM data points into a human-readable object.
     * Use this for SMS, Email, and internal logging.
     */
    resolveNamed(lead, customOverrides = {}) {
        if (!lead) return {};
        
        // Comprehensive named registry (Restored Full Enterprise List with Aliases)
        const namedPayload = {
            // --- Customer / Lead ---
            "name": this.extractValue(lead, 'fullName'),
            "lead_name": this.extractValue(lead, 'fullName'),
            "customerName": this.extractValue(lead, 'fullName'),
            "customer_name": this.extractValue(lead, 'fullName'),
            "full_name": this.extractValue(lead, 'fullName'),
            "fullName": this.extractValue(lead, 'fullName'),
            "customer_first_name": this.extractValue(lead, 'firstName'),
            "first_name": this.extractValue(lead, 'firstName'),
            "mobile": this.extractValue(lead, 'mobile'),
            "customer_mobile": this.extractValue(lead, 'mobile'),
            "email": this.extractValue(lead, 'email'),
            "customer_email": this.extractValue(lead, 'email'),
            "lead_id": this.extractValue(lead, 'leadId'),
            "lead_source": this.extractValue(lead, 'source'),
            "lead_stage": this.extractValue(lead, 'stage'),
            
            // --- Unit Specifications ---
            "category": this.extractValue(lead, 'category'),
            "property_category": this.extractValue(lead, 'category'),
            "sub_category": this.extractValue(lead, 'subCategory'),
            "subCategory": this.extractValue(lead, 'subCategory'),
            "property_sub_category": this.extractValue(lead, 'subCategory'),
            "unit": this.extractValue(lead, 'unitNo'),
            "unit_number": this.extractValue(lead, 'unitNo'),
            "floor_level": this.extractValue(lead, 'floor'),
            "facing": this.extractValue(lead, 'facing'),
            "property_facing": this.extractValue(lead, 'facing'),
            "size": this.extractValue(lead, 'sizeType'),
            "property_size": this.extractValue(lead, 'sizeType'),
            "built_up_area": this.extractValue(lead, 'builtUpArea'),
            "carpet_area": this.extractValue(lead, 'carpetArea'),
            
            // --- Project Deep-Dive ---
            "project": this.extractValue(lead, 'projectName'),
            "project_name": this.extractValue(lead, 'projectName'),
            "developer": this.extractValue(lead, 'developerName'),
            "developer_name": this.extractValue(lead, 'developerName'),
            "rera_number": this.extractValue(lead, 'reraNumber'),
            "location": this.extractValue(lead, 'projectLocality'),
            "project_location": this.extractValue(lead, 'projectLocality'),
            
            // --- Financials ---
            "price": this.extractValue(lead, 'price'),
            "property_price": this.extractValue(lead, 'price'),
            "total_cost": this.extractValue(lead, 'totalCost'),
            "payment_plan": this.extractValue(lead, 'paymentPlan'),
            
            // --- AI Insights ---
            "ai_summary": this.extractValue(lead, 'intentSummary'),
            "ai_intent_summary": this.extractValue(lead, 'intentSummary'),
            "ai_score": this.extractValue(lead, 'aiClosingProbability'),
            "ai_closing_score": this.extractValue(lead, 'aiClosingProbability'),
            
            // --- Agent / System ---
            "agent": this.extractValue(lead, 'agentName'),
            "agent_name": this.extractValue(lead, 'agentName'),
            "agent_mobile": this.extractValue(lead, 'agentMobile'),
            "company": "Bharat Properties",
            "company_name": "Bharat Properties",
            "office_address": "Gurugram, Haryana",
            
            // --- Smart Links ---
            "site_visit_link": this.extractValue(lead, 'siteVisitLink'),
            "feedback_link": this.extractValue(lead, 'feedbackLink'),
            "property_list_default": this.extractValue(lead, 'matchListDefault'),
            "property_list_dtl": this.extractValue(lead, 'matchListDetailed'),
            "portal_link": "https://crm.bharatproperties.co",
            // Button URL token — only the dynamic suffix ({{1}}) for URL buttons
            // Template base URL is defined in Meta, we only provide the token part
            "siteVisitToken": (() => {
                try {
                    const leadId = lead.id || lead._id;
                    if (!leadId) return 'visit';
                    return jwt.sign(
                        { leadId: String(leadId), source: 'wa_match_centre' },
                        process.env.JWT_SECRET || 'crm_secret_key',
                        { expiresIn: '30d' }
                    );
                } catch(e) { return 'visit'; }
            })(),
            "site_visit_token": (() => {
                try {
                    const leadId = lead.id || lead._id;
                    if (!leadId) return 'visit';
                    return jwt.sign(
                        { leadId: String(leadId), source: 'wa_match_centre' },
                        process.env.JWT_SECRET || 'crm_secret_key',
                        { expiresIn: '30d' }
                    );
                } catch(e) { return 'visit'; }
            })(),

            // Inject Runtime Custom Data
            ...customOverrides
        };

        return namedPayload;
    }

    /**
     * LAYER 2: Platform Transformer (WhatsApp / Numbered)
     * Converts named payload to numbered indices ({{1}}, {{2}}...)
     * Priority: Runtime Overrides > Template Mapping > Global Mapping
     */
    transformToNumbered(namedPayload, templateMapping = {}, globalMapping = {}) {
        const numberedPayload = {};
        
        // We iterate through standard indices (1-30)
        for (let i = 1; i <= 30; i++) {
            const idx = String(i);
            
            // 1. Check Template Level Mapping (Highest Priority)
            // Example templateMapping[idx] = "customer_name"
            const templateTargetName = templateMapping[idx];
            if (templateTargetName && namedPayload[templateTargetName]) {
                numberedPayload[idx] = namedPayload[templateTargetName];
                continue;
            }

            // 2. Check Global Registry Mapping (Fallback)
            // Example globalMapping[idx] = { source: "customer_name", mode: "static" }
            const globalConfig = globalMapping[idx];
            const globalTargetName = typeof globalConfig === 'object' ? globalConfig.source : globalConfig;
            
            if (globalTargetName && namedPayload[globalTargetName]) {
                numberedPayload[idx] = namedPayload[globalTargetName];
            } else {
                numberedPayload[idx] = ''; // Safe empty string
            }
        }

        return numberedPayload;
    }

    /**
     * LAYER 3: Content Parser (Named Tags)
     * Replaces {named_variable} tags in a string with actual values.
     * Use this for SMS and Email bodies.
     */
    resolveContent(content, lead, customOverrides = {}) {
        if (!content || !lead) return content;
        
        const namedPayload = this.resolveNamed(lead, customOverrides);
        let resolvedContent = content;

        // Regex to find {variable_name}
        const regex = /\{([a-zA-Z0-9_]+)\}/g;
        
        resolvedContent = resolvedContent.replace(regex, (match, key) => {
            return namedPayload[key] !== undefined ? namedPayload[key] : match;
        });

        return resolvedContent;
    }

    /**
     * LEGACY WRAPPER: resolveForLeads
     * Maintains backward compatibility for existing controllers.
     */
    resolveForLeads(leads, globalMapping = {}, templateMapping = {}, runtimeOverrides = {}) {
        if (!leads) return [];
        const isArray = Array.isArray(leads);
        const dataArr = isArray ? leads : [leads];
        
        const resolved = dataArr.map(lead => {
            const named = this.resolveNamed(lead, runtimeOverrides);
            return this.transformToNumbered(named, templateMapping, globalMapping);
        });

        return isArray ? resolved : resolved[0];
    }

    /**
     * Core extraction logic for 50+ enterprise fields.
     */
    extractValue(lead, source, customVal = '') {
        if (!source) return '';
        if (source === 'custom') return customVal;

        // Resolve deep documents from lead context
        const projectDoc = lead.projectId || lead.project || {};
        const inventoryDoc = (lead.interestedInventory && Array.isArray(lead.interestedInventory) && lead.interestedInventory[0]) || lead.inventory || {};

        // Common Fields
        switch (source) {
            case 'name':
            case 'fullName': {
                const n = (lead.fullName || lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`).trim();
                return (n && n !== '-' && n !== '—') ? n : 'Customer';
            }
            case 'firstName': {
                const fn = lead.firstName || (lead.name ? lead.name.split(' ')[0] : '');
                return (fn && fn !== '-' && fn !== '—') ? fn : 'Customer';
            }
            case 'lastName':
                return lead.lastName || '';
            case 'salutation':
                return lead.salutation || 'Mr./Ms.';
            case 'mobile':
                return lead.mobile || '—';
            case 'email':
                return lead.email || '';
            case 'leadId':
                return lead.id || lead._id || '';
            case 'assignedTo':
            case 'owner':
                {
                    const agentName = lead.owner || lead.assignment?.assignedTo?.name || lead.agentName || 'Our Representative';
                    const agentMobile = lead.assignment?.assignedTo?.mobile || lead.ownerMobile || lead.agentMobile || '';
                    return agentMobile ? `${agentName} (📞 ${agentMobile})` : agentName;
                }
            case 'agentMobile':
            case 'ownerMobile':
                return lead.assignment?.assignedTo?.mobile || lead.ownerMobile || '';
            
            // Lead Specific
            case 'source':
                return lead.source || 'Direct';
            case 'status':
            case 'stage':
                return lead.status || lead.stage || 'New';
            case 'priority':
                return lead.priority || 'Normal';
            case 'campaign':
                return lead.campaign || 'Organic';
            case 'remark':
            case 'notes':
                return lead.remark || lead.notes || '';
            case 'budget':
                return lead.budget || (lead.budgetMin ? `₹${lead.budgetMin}` : '');
            case 'category':
            case 'propertyType':
                {
                    const rawCat = lead.propertyType || lead.category;
                    if (!rawCat) return '';
                    if (Array.isArray(rawCat)) {
                        return rawCat.map(p => {
                            if (!p) return '';
                            if (typeof p === 'object') return p.lookup_value || p.name || p.label || '';
                            return p;
                        }).filter(Boolean).join(', ');
                    }
                    if (typeof rawCat === 'object') {
                        return rawCat.lookup_value || rawCat.name || rawCat.label || '';
                    }
                    return rawCat;
                }
            case 'subCategory':
                {
                    // 1. Try populated subRequirement
                    if (lead.subRequirement) {
                        const val = typeof lead.subRequirement === 'object' ? (lead.subRequirement.lookup_value || lead.subRequirement.name) : lead.subRequirement;
                        if (val) return val;
                    }
                    // 2. Try array-based subType (more common)
                    if (Array.isArray(lead.subType) && lead.subType.length > 0) {
                        return lead.subType.map(s => {
                            if (!s) return '';
                            if (typeof s === 'object') return s.lookup_value || s.name || s.label || '';
                            return s;
                        }).filter(Boolean).join(', ');
                    }
                    // 3. Try scalar subType
                    if (lead.subType) {
                        if (typeof lead.subType === 'object') {
                            return lead.subType.lookup_value || lead.subType.name || lead.subType.label || '';
                        }
                        return lead.subType;
                    }
                    // 4. Try legacy subCategory string
                    return lead.subCategory || '';
                }
            case 'sizeType':
            case 'areaMetric':
                return lead.sizeType || lead.areaMetric || '';
            case 'unitType':
                return lead.unitType || '';
            case 'road':
            case 'roadWidth':
                return lead.road || lead.roadWidth || '';
            
            // Location
            case 'locCity':
            case 'city':
                return lead.city || lead.locCity || '';
            case 'locArea':
            case 'area':
                return lead.area || lead.locArea || '';
            case 'locBlock':
            case 'block':
                return lead.block || lead.locBlock || '';
            case 'locPinCode':
            case 'pincode':
                return lead.pincode || lead.locPinCode || '';
            case 'locState':
                return lead.locState || '';

            // Property / Inventory Advanced (Requires enrichment from job context or DB)
            case 'propertyName':
                return lead.projectName || lead.propertyName || '';
            case 'unitNumber':
            case 'unitNo':
                return lead.unitNumber || lead.unitNo || '';
            case 'projectName':
                return lead.project?.name || lead.projectName || lead.project || '';
            case 'agentName':
            case 'assignedTo':
                return lead.assignment?.assignedTo?.name || lead.agentName || lead.owner || 'Our Representative';
            case 'unitNo':
                return lead.unitNo || lead.unitNumber || '';
            case 'sizeType':
                return lead.sizeType?.lookup_value || lead.areaMetric || lead.sizeType || '';
            case 'budget':
            case 'price':
                return lead.budget?.lookup_value || lead.price || lead.budget || '';

            case 'siteVisitLink':
                try {
                    const leadId = lead.id || lead._id;
                    if (!leadId) return 'token_missing';
                    const token = jwt.sign({ leadId, projectId: lead.projectName || lead.project?.name || null, source: 'whatsapp_smart_link' }, process.env.JWT_SECRET || 'crm_secret_key', { expiresIn: '30d' });
                    const baseUrl = process.env.FRONTEND_URL || 'https://bharatproperties.co';
                    const formSlug = 'standard-project-tour-scheduler-bqnh6';
                    return `${baseUrl}/public/form/${formSlug}?ref=${token}`;
                } catch (e) {
                    console.error("[VariableResolution] JWT Error:", e.message);
                    return 'error';
                }

            case 'feedbackLink':
                try {
                    const leadId = lead.id || lead._id;
                    if (!leadId) return 'token_missing';
                    const token = jwt.sign({ leadId, source: 'customer_feedback' }, process.env.JWT_SECRET || 'crm_secret_key', { expiresIn: '60d' });
                    const baseUrl = process.env.FRONTEND_URL || 'https://bharatproperties.co';
                    // Using your standard feedback form slug
                    const formSlug = 'customer-experience-feedback-qx9z2'; 
                    return `${baseUrl}/public/feedback/${formSlug}?ref=${token}`;
                } catch (e) {
                    return 'error';
                }

            case 'matchListDefault':
            case 'matchList': // Legacy support
                if (!lead.matchedProperties || !Array.isArray(lead.matchedProperties)) {
                    return 'Please check our latest premium property matches below:';
                }
                return lead.matchedProperties.map((p, i) => {
                    const inv = p.inventoryId || {};
                    const base = (inv.inventoryId && typeof inv.inventoryId === 'object') ? inv.inventoryId : inv;
                    const unit = p.unitNo || inv.unitNo || base.unitNo || base.unitNumber || 'TBD';
                    
                    let sectorName = typeof p.sector === 'string' && /^[a-fA-F0-9]{24}$/.test(p.sector) ? '' : (p.sector || inv.sector || base.sector);
                    let pName = p.projectName || inv.projectName || base.projectName || sectorName || 'Project';
                    if (typeof pName === 'string' && /^[a-fA-F0-9]{24}$/.test(pName)) pName = 'Premium Project';

                    let sz = 'Standard Size';
                    if (inv.sizeLabel) sz = inv.sizeLabel;
                    else if (base.sizeLabel) sz = base.sizeLabel;
                    else if (inv.sizeConfig?.lookup_value || inv.sizeConfig?.name || inv.sizeConfig?.label) sz = inv.sizeConfig.lookup_value || inv.sizeConfig.name || inv.sizeConfig.label;
                    else if (base.sizeConfig?.lookup_value || base.sizeConfig?.name || base.sizeConfig?.label) sz = base.sizeConfig.lookup_value || base.sizeConfig.name || base.sizeConfig.label;
                    else if (typeof inv.sizeConfig === 'string' && !/^[a-fA-F0-9]{24}$/.test(inv.sizeConfig)) sz = inv.sizeConfig;
                    else if (typeof base.sizeConfig === 'string' && !/^[a-fA-F0-9]{24}$/.test(base.sizeConfig)) sz = base.sizeConfig;
                    else if (p.size) sz = p.size;
                    else if (inv.size?.value) sz = inv.size.value;
                    else if (base.size?.value) sz = base.size.value;
                    else if (inv.size && typeof inv.size !== 'object') sz = inv.size;
                    else if (base.size && typeof base.size !== 'object') sz = base.size;

                    if (sz === 'Standard Size' || !sz) {
                        let subCat = inv.subCategory || base.subCategory;
                        if (subCat) {
                            sz = typeof subCat === 'object' ? (subCat.lookup_value || subCat.name || subCat.label) : subCat;
                        }
                        if (!sz) sz = 'Standard Size';
                    }
                    console.log(`[DEBUG] Deal ${unit} sz=${sz} (inv.sizeLabel=${inv.sizeLabel}, base.sizeLabel=${base.sizeLabel})`);

                    let szUnit = '';
                    if (!inv.sizeLabel && !base.sizeLabel && sz !== inv.subCategory && sz !== base.subCategory && typeof sz === 'number') {
                        szUnit = p.sizeUnit || inv.size?.unit || base.size?.unit || inv.sizeUnit || base.sizeUnit || 'Sq.Ft.';
                    } else if (sz && !sz.toString().toLowerCase().includes('bhk') && !sz.toString().toLowerCase().includes('sq')) {
                        szUnit = p.sizeUnit || inv.sizeUnit || base.sizeUnit || '';
                    }
                    if (sz && (sz.toString().toLowerCase() === 'plot' || sz.toString().toLowerCase() === 'standard size')) {
                        szUnit = '';
                    }
                    
                    let pr = 'Price on call';
                    if (!lead.hidePrice && !lead.hidePrices) {
                        const rawPrice = p.price || inv.price?.value || inv.price;
                        if (rawPrice && !isNaN(rawPrice)) {
                            pr = `₹${(Number(rawPrice) / 10000000).toFixed(2)} Cr`;
                        } else {
                            pr = rawPrice || 'On Request';
                        }
                    }

                    let unitStr = '';
                    if (!lead.hideUnit && !lead.hideUnitNumber && unit !== 'TBD' && unit !== '') {
                        unitStr = `#${unit} | `;
                    }

                    if (lead.templateId === 'free_text') {
                        return `${i + 1}️⃣ 🏢 ${unitStr}${pName}\n   📐 ${sz} ${szUnit}\n   💰 ${pr}`;
                    }
                    return `${i + 1}️⃣ 🏢 ${unitStr}${pName} | 📐 ${sz} ${szUnit} | 💰 ${pr}`;
                }).join(lead.templateId === 'free_text' ? '\n\n' : '\n');

            case 'matchListDetailed':
                if (!lead.matchedProperties || !Array.isArray(lead.matchedProperties)) {
                    return 'Here are the detailed property options curated for you:';
                }
                return lead.matchedProperties.map((p, i) => {
                    const inv = p.inventoryId || {};
                    const base = (inv.inventoryId && typeof inv.inventoryId === 'object') ? inv.inventoryId : inv;
                    const unit = p.unitNo || inv.unitNo || base.unitNo || base.unitNumber || 'TBD';
                    
                    let sectorName = typeof p.sector === 'string' && /^[a-fA-F0-9]{24}$/.test(p.sector) ? '' : (p.sector || inv.sector || base.sector);
                    let pName = p.projectName || inv.projectName || base.projectName || sectorName || 'Premium Project';
                    if (typeof pName === 'string' && /^[a-fA-F0-9]{24}$/.test(pName)) pName = 'Premium Project';

                    let sz = 'Standard Size';
                    if (inv.sizeLabel) sz = inv.sizeLabel;
                    else if (base.sizeLabel) sz = base.sizeLabel;
                    else if (inv.sizeConfig?.lookup_value || inv.sizeConfig?.name || inv.sizeConfig?.label) sz = inv.sizeConfig.lookup_value || inv.sizeConfig.name || inv.sizeConfig.label;
                    else if (base.sizeConfig?.lookup_value || base.sizeConfig?.name || base.sizeConfig?.label) sz = base.sizeConfig.lookup_value || base.sizeConfig.name || base.sizeConfig.label;
                    else if (typeof inv.sizeConfig === 'string' && !/^[a-fA-F0-9]{24}$/.test(inv.sizeConfig)) sz = inv.sizeConfig;
                    else if (typeof base.sizeConfig === 'string' && !/^[a-fA-F0-9]{24}$/.test(base.sizeConfig)) sz = base.sizeConfig;
                    else if (p.size) sz = p.size;
                    else if (inv.size?.value) sz = inv.size.value;
                    else if (base.size?.value) sz = base.size.value;
                    else if (inv.size && typeof inv.size !== 'object') sz = inv.size;
                    else if (base.size && typeof base.size !== 'object') sz = base.size;

                    if (sz === 'Standard Size' || !sz) {
                        let subCat = inv.subCategory || base.subCategory;
                        if (subCat) {
                            sz = typeof subCat === 'object' ? (subCat.lookup_value || subCat.name || subCat.label) : subCat;
                        }
                        if (!sz) sz = 'Standard Size';
                    }

                    let szUnit = '';
                    if (!inv.sizeLabel && !base.sizeLabel && sz !== inv.subCategory && sz !== base.subCategory && typeof sz === 'number') {
                        szUnit = p.sizeUnit || inv.size?.unit || base.size?.unit || inv.sizeUnit || base.sizeUnit || 'Sq.Ft.';
                    } else if (sz && !sz.toString().toLowerCase().includes('bhk') && !sz.toString().toLowerCase().includes('sq')) {
                        szUnit = p.sizeUnit || inv.sizeUnit || base.sizeUnit || '';
                    }
                    if (sz && (sz.toString().toLowerCase() === 'plot' || sz.toString().toLowerCase() === 'standard size')) {
                        szUnit = '';
                    }
                    
                    let pr = 'Price on call';
                    if (!lead.hidePrice && !lead.hidePrices) {
                        const rawPrice = p.price || inv.price?.value || inv.price;
                        if (rawPrice && !isNaN(rawPrice)) {
                            pr = `${(Number(rawPrice) / 10000000).toFixed(2)} Cr`;
                        } else {
                            pr = rawPrice || 'On Request';
                        }
                    }

                    const getVal = (v) => typeof v === 'object' && v !== null ? (v.lookup_value || v.name || v.label || '') : (v || '');
                    
                    const category = getVal(base.category || inv.category || p.category);
                    const subCategory = getVal(base.subCategory || inv.subCategory || p.subCategory);
                    const road = getVal(base.roadWidth || inv.roadWidth || inv.road || p.road);
                    const direction = getVal(base.direction || inv.direction || p.direction);
                    const facing = getVal(base.facing || inv.facing || inv.corner || p.corner || p.facing);
                    const buildupType = getVal(base.buildupType || inv.buildupType || p.buildupType);
                    const unitType = getVal(base.unitType || inv.unitType || p.unitType) || category; 
                    
                    let mapsLink = '';
                    if (!lead.hideLocation) {
                        if (inv.latitude && inv.longitude) {
                            mapsLink = `https://www.google.com/maps?q=${inv.latitude},${inv.longitude}`;
                        } else if (inv.googleMapsLink) {
                            mapsLink = `${inv.googleMapsLink}`;
                        }
                    }

                    // 1. Unit Number
                    let unitPart = '';
                    if (!lead.hideUnit && !lead.hideUnitNumber && unit !== 'TBD' && unit !== '') {
                        unitPart = `#${unit}`;
                    }
                    
                    // 3. Sub Category (Unit Type)
                    let subCategoryPart = subCategory || '';
                    if (unitType && unitType !== 'N/A' && unitType !== subCategory) {
                        subCategoryPart = subCategoryPart ? `${subCategoryPart} (${unitType})` : unitType;
                    }
                    
                    // Sequence: Unit Number | Sub Category (Unit Type) | Size Label | Project Name | Direction | Road | Facing | Google Location | Expected Price
                    const segments = [
                        unitPart,                                   // 1. Unit Number
                        subCategoryPart,                            // 2. Sub Category (Unit Type)
                        `${sz} ${szUnit}`.trim(),                   // 3. Size Label
                        pName,                                      // 4. Project Name
                        direction,                                  // 5. Direction
                        road,                                       // 6. Road
                        facing,                                     // 7. Facing
                        mapsLink,                                   // 8. Google Location
                        pr !== 'Price on call' ? `₹${pr}` : pr      // 9. Expected Price (formatted)
                    ];
                    
                    // Filter out empty segments, 'N/A', and unpopulated ObjectIDs
                    const cleanSegments = segments.filter(seg => 
                        seg && 
                        typeof seg === 'string' && 
                        seg.trim() !== '' && 
                        seg.trim().toLowerCase() !== 'n/a' && 
                        seg.trim().toLowerCase() !== '₹on request' &&
                        !/^[a-fA-F0-9]{24}$/.test(seg.trim())
                    );

                    return cleanSegments.join(' | ');
                }).join('\n\n---------------------------\n\n');

            default:
                // Try deep access for custom fields
                return lead[source] || '';
        }
    }
}

export default new VariableResolutionService();
