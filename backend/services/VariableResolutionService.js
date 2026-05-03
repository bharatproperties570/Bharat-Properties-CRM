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
     * "Tiered Resolution Engine"
     * Priority: Runtime Overrides > Template Mapping > Global Mapping
     */
    resolveForLeads(leads, globalMapping = {}, templateMapping = {}, runtimeOverrides = {}) {
        if (!leads) return [];
        const isArray = Array.isArray(leads);
        const dataArr = isArray ? leads : [leads];
        
        const resolved = dataArr.map(lead => {
            const params = {};
            
            // 🧠 SENIOR PROFESSIONAL LOGIC: Combine all mapping layers
            // We iterate through a unified set of indices (1-30)
            for (let i = 1; i <= 30; i++) {
                const idx = String(i);
                
                // 1. Check Runtime Overrides (e.g. from an API payload)
                if (runtimeOverrides && runtimeOverrides[idx]) {
                    params[idx] = runtimeOverrides[idx];
                    continue;
                }

                // 2. Check Template-Level Overrides
                if (templateMapping && templateMapping[idx]) {
                    params[idx] = this.extractValue(lead, templateMapping[idx]);
                    continue;
                }

                // 3. Fallback to Global Mapping
                const globalSource = globalMapping[idx];
                if (globalSource) {
                    params[idx] = this.extractValue(lead, globalSource);
                } else {
                    params[idx] = ''; // Safe empty fallback
                }
            }
            return params;
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
