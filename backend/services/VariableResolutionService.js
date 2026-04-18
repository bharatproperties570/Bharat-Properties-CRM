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
                return lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Customer';
            case 'firstName':
                return lead.firstName || 'Customer';
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
                return lead.projectName || '';
            case 'possessionStatus':
                return lead.possessionStatus || 'Contact for info';
            case 'furnishType':
                return lead.furnishType || 'Semi-Furnished';
            case 'size':
                return lead.size || '';
            case 'sizeUnit':
                return lead.sizeUnit || 'Sq.Ft.';
            case 'facing':
                return lead.facing || '-';
            case 'floor':
                return lead.floor || '-';
            
            // Financials
            case 'price':
                return lead.price ? (typeof lead.price === 'number' ? `₹${lead.price.toLocaleString()}` : lead.price) : '';
            case 'totalCost':
                return lead.totalCost || '';
            case 'tokenAmount':
                return lead.tokenAmount ? `₹${lead.tokenAmount.toLocaleString()}` : '';
            case 'agreementAmount':
                return lead.agreementAmount ? `₹${lead.agreementAmount.toLocaleString()}` : '';
            case 'maintenanceCharges':
                return lead.maintenanceCharges || '';
            
            // Transaction Details
            case 'transactionType':
                return lead.transactionType || 'Resale';
            case 'dealType':
                return lead.dealType || 'Sale';
            case 'timeline':
                return lead.timeline || 'Immediate';
            
            // AI Intelligence
            case 'aiProbability':
            case 'aiClosingProbability':
                return lead.ai_closing_probability ? `${lead.ai_closing_probability}%` : 'N/A';
            case 'intentSummary':
                return lead.ai_intent_summary || '';

            // Project Details (Enterprise Real Estate)
            case 'reraNumber':
                return lead.projectId?.reraNumber || lead.reraNumber || '';
            case 'developerName':
                return lead.projectId?.developerName || lead.developerName || '';
            case 'launchDate':
                const lDate = lead.projectId?.launchDate || lead.launchDate;
                return lDate ? new Date(lDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';
            case 'possessionDate':
            case 'expectedCompletion':
                const cDate = lead.projectId?.possessionDate || lead.projectId?.expectedCompletionDate || lead.expectedCompletion;
                return cDate ? new Date(cDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'Contact Support';
            case 'amenities':
                const amens = lead.projectId?.amenities;
                if (amens && typeof amens === 'object') {
                    return Object.entries(amens).filter(([_, v]) => v).map(([k]) => k).join(', ');
                }
            
            // Dates
            case 'currentDate':
                return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            case 'bookingDate':
            // --- Project Deep-Dive ---
            case 'reraNumber': return projectDoc.reraNumber || '';
            case 'developerName': return projectDoc.developerName || '';
            case 'launchDate': return projectDoc.launchDate ? new Date(projectDoc.launchDate).toLocaleDateString() : '';
            case 'expectedCompletion': return projectDoc.expectedCompletionDate ? new Date(projectDoc.expectedCompletionDate).toLocaleDateString() : '';
            case 'projectCity': return projectDoc.address?.city || '';
            case 'projectLocality': return projectDoc.address?.locality || '';
            case 'projectArea': return projectDoc.address?.area || '';
            case 'totalUnits': return projectDoc.totalUnits || '';
            case 'totalBlocks': return projectDoc.totalBlocks || '';
            case 'totalFloors': return projectDoc.totalFloors || '';
            case 'landArea': return projectDoc.landArea ? `${projectDoc.landArea} ${projectDoc.landAreaUnit || ''}` : '';
            case 'approvedBank': return projectDoc.approvedBank || '';
            case 'amenities': 
                if (projectDoc.amenities instanceof Map) {
                    return Array.from(projectDoc.amenities.entries())
                        .filter(([_, v]) => v)
                        .map(([k]) => k)
                        .join(', ');
                } else if (projectDoc.amenities && typeof projectDoc.amenities === 'object') {
                    return Object.entries(projectDoc.amenities).filter(([_, v]) => v).map(([k]) => k).join(', ');
                }
                return '';

            // --- Unit specifications ---
            case 'unitNo': return inventoryDoc.unitNumber || inventoryDoc.unitNo || '';
            case 'floor': return inventoryDoc.floor || '';
            case 'facing': return inventoryDoc.facing?.lookup_value || inventoryDoc.facing || '';
            case 'direction': return inventoryDoc.direction?.lookup_value || inventoryDoc.direction || '';
            case 'possessionStatus': return inventoryDoc.possessionStatus || '';
            case 'furnishType': return inventoryDoc.furnishType || '';
            case 'ageOfConstruction': return inventoryDoc.ageOfConstruction || '';
            case 'carpetArea': return inventoryDoc.carpetArea?.value ? `${inventoryDoc.carpetArea.value} ${inventoryDoc.carpetArea.unit || 'Sq.Ft.'}` : '';
            case 'builtUpArea': return inventoryDoc.builtUpArea?.value ? `${inventoryDoc.builtUpArea.value} ${inventoryDoc.builtUpArea.unit || 'Sq.Ft.'}` : '';
            case 'totalSaleableArea': return inventoryDoc.totalSaleableArea?.value ? `${inventoryDoc.totalSaleableArea.value} ${inventoryDoc.totalSaleableArea.unit || 'Sq.Ft.'}` : '';

            // --- Advanced Financials ---
            case 'price': return this.formatCurrency(inventoryDoc.price?.value);
            case 'totalCost': return this.formatCurrency(inventoryDoc.totalCost?.value);
            case 'rentPrice': return this.formatCurrency(inventoryDoc.rentPrice?.value);
            case 'maintenanceAmount': return projectDoc.pricing?.masterCharges?.find(c => c.name?.toLowerCase().includes('maintenance'))?.amount || '';
            case 'gstStatus': return projectDoc.pricing?.masterCharges?.some(c => c.gstEnabled) ? 'GST Applicable' : 'Inclusive of GST';
            case 'paymentPlan': return projectDoc.pricing?.paymentPlans?.[0]?.name || 'Standard Plan';

            // --- Dates & Activity ---
            case 'currentDate': return new Date().toLocaleDateString();
            case 'bookingDate': return lead.bookingDate ? new Date(lead.bookingDate).toLocaleDateString() : '';
            case 'visitDate': return lead.visitDate ? new Date(lead.visitDate).toLocaleDateString() : '';
            case 'followUpDate': 
            case 'nextFollowUpDate':
                return lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Soon';
            
            // --- Outcome Context ---
            case 'currentOutcome': return lead.currentOutcome || 'Follow-up';
            case 'outcomeNotes': return lead.outcomeNotes || lead.notes || lead.remark || '';
            case 'agentName': return lead.agentName || lead.ownerName || 'Your Consultant';
            case 'feedbackLink': return `https://bharatproperties.com/feedback/${lead._id || lead.id}`;
            case 'visitLocation': return lead.visitLocation || 'Project Site Office';

            // --- Branding & System ---
            case 'companyName': return 'Bharat Properties';
            case 'officeAddress': return 'Corporate Office, Bharat Properties';
            case 'customerSupportNo': return 'Sales Support';
            case 'crmLink': return 'https://crm.bharatproperties.com';

            default:
                // Try direct access if not in the map
                return lead[source] || '';
        }
    }
}

export default new VariableResolutionService();
