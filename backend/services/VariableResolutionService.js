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
        
        // Comprehensive named registry (Restored Full Enterprise List)
        const namedPayload = {
            // --- Customer / Lead ---
            "customer_name": this.extractValue(lead, 'fullName'),
            "customer_first_name": this.extractValue(lead, 'firstName'),
            "customer_mobile": this.extractValue(lead, 'mobile'),
            "customer_email": this.extractValue(lead, 'email'),
            "lead_id": this.extractValue(lead, 'leadId'),
            "lead_source": this.extractValue(lead, 'source'),
            "lead_stage": this.extractValue(lead, 'stage'),
            
            // --- Unit Specifications ---
            "unit_number": this.extractValue(lead, 'unitNo'),
            "floor_level": this.extractValue(lead, 'floor'),
            "property_facing": this.extractValue(lead, 'facing'),
            "property_size": this.extractValue(lead, 'sizeType'),
            "built_up_area": this.extractValue(lead, 'builtUpArea'),
            "carpet_area": this.extractValue(lead, 'carpetArea'),
            
            // --- Project Deep-Dive ---
            "project_name": this.extractValue(lead, 'projectName'),
            "developer_name": this.extractValue(lead, 'developerName'),
            "rera_number": this.extractValue(lead, 'reraNumber'),
            "project_location": this.extractValue(lead, 'projectLocality'),
            
            // --- Financials ---
            "property_price": this.extractValue(lead, 'price'),
            "total_cost": this.extractValue(lead, 'totalCost'),
            "payment_plan": this.extractValue(lead, 'paymentPlan'),
            
            // --- AI Insights ---
            "ai_intent_summary": this.extractValue(lead, 'intentSummary'),
            "ai_closing_score": this.extractValue(lead, 'aiClosingProbability'),
            
            // --- Agent / System ---
            "agent_name": this.extractValue(lead, 'agentName'),
            "agent_mobile": this.extractValue(lead, 'agentMobile'),
            "company_name": "Bharat Properties",
            "office_address": "Gurugram, Haryana",
            
            // --- Smart Links ---
            "site_visit_link": this.extractValue(lead, 'siteVisitLink'),
            "feedback_link": this.extractValue(lead, 'feedbackLink'),
            "property_list_default": this.extractValue(lead, 'matchListDefault'),
            "property_list_detailed": this.extractValue(lead, 'matchListDetailed'),
            "portal_link": "https://crm.bharatproperties.co",

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
            case 'fullName':
                return lead.fullName || lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Customer';
            case 'firstName':
                return lead.firstName || (lead.name ? lead.name.split(' ')[0] : 'Customer');
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
                return lead.owner || lead.assignment?.assignedTo?.name || lead.agentName || 'Assigned Representative';
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
            case 'subCategory':
                return lead.subCategory || '';
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
            case 'subCategory':
                return lead.subRequirement?.lookup_value || lead.subCategory || '';
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
                    const loc = p.inventoryId?.projectName || p.sector || 'Prime Location';
                    const sz = p.size || p.inventoryId?.size?.value || 'Standard Size';
                    const szUnit = p.inventoryId?.size?.unit || 'Sq.Ft.';
                    const pr = p.price || (p.inventoryId?.price?.value ? `₹${(p.inventoryId.price.value / 10000000).toFixed(2)} Cr` : 'On Request');
                    return `${i + 1}️⃣ 🏢 ${loc} | 📐 ${sz} ${szUnit} | 💰 ${pr}`;
                }).join('\n');

            case 'matchListDetailed':
                if (!lead.matchedProperties || !Array.isArray(lead.matchedProperties)) {
                    return 'Here are the detailed property options curated for you:';
                }
                return lead.matchedProperties.map((p, i) => {
                    const inv = p.inventoryId || {};
                    const unit = inv.unitNo || inv.unitNumber || 'TBD';
                    const project = inv.projectName || 'Premium Project';
                    const sz = inv.size?.value || 'N/A';
                    const szUnit = inv.size?.unit || 'Sq.Ft.';
                    const pr = inv.price?.value ? `₹${(inv.price.value / 10000000).toFixed(2)} Cr` : 'On Request';
                    
                    let mapsLink = '';
                    if (inv.latitude && inv.longitude) {
                        mapsLink = `\n📍 View Location: https://www.google.com/maps?q=${inv.latitude},${inv.longitude}`;
                    }

                    return `${i + 1}️⃣ #${unit} | ${project} | ${sz} ${szUnit} | ${pr}${mapsLink}`;
                }).join('\n\n');

            default:
                // Try deep access for custom fields
                return lead[source] || '';
        }
    }
}

export default new VariableResolutionService();
