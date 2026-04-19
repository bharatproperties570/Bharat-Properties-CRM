/**
 * VariableResolutionService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * "Enterprise Grade" Dynamic Variable Resolver.
 * Resolves indices like {{1}}, {{2}}... based on a mapping registry
 * and source data (Lead, Deal, Inventory).
 */

class VariableResolutionService {
    /**
     * Extracts values for a list of leads based on a mapping configuration.
     * @param {Object|Array} leadData - Single lead or array of leads (already enriched with some context)
     * @param {Object} mapping - { "1": "firstName", "2": "possessionStatus", ... }
     * @returns {Object|Array} Resolved params or array of resolved params
     */
    resolveForLeads(leads, mapping) {
        if (!leads) return [];
        const isArray = Array.isArray(leads);
        const dataArr = isArray ? leads : [leads];
        
        const resolved = dataArr.map(lead => {
            const params = {};
            for (const [idx, source] of Object.entries(mapping)) {
                // If the key is not a number (e.g., custom_val), skip here
                if (isNaN(idx)) continue;
                
                params[idx] = this.extractValue(lead, source, mapping[`${idx}_val`]);
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

            default:
                // Try deep access for custom fields
                return lead[source] || '';
        }
    }
}

export default new VariableResolutionService();
