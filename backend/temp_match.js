
export const getBulkDealExactMatchCounts = async (deals) => {
    try {
        const Lead = (await import('../models/Lead.js')).default;
        const Lookup = (await import('../models/Lookup.js')).default;
        
        const activeLeads = await Lead.find({
            stage: { $nin: ['Closed', 'Lost', 'Junk', 'Unqualified', 'Sold Out'] }
        })
        .select('_id budgetMin budgetMax areaMin areaMax locCity locArea sector projectName requirement subType sizeType unitType location')
        .populate('projectName', 'name')
        .lean();
        
        const allLookups = await Lookup.find({}).lean();
        const lookupIdMap = new Map(allLookups.map(l => [String(l._id), String(l.lookup_value || '').toLowerCase()]));

        const getLookupVal = (val) => {
            if (!val) return '';
            if (val.lookup_value) return String(val.lookup_value).toLowerCase();
            const idStr = String(val._id || val);
            const resolved = lookupIdMap.get(idStr);
            if (resolved) return resolved;
            if (!/^[0-9a-fA-F]{24}$/.test(idStr)) return idStr.toLowerCase();
            return '';
        };

        const extractNumericSize = (val) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            const clean = String(val).replace(/,/g, '');
            const nums = clean.match(/\d+(\.\d+)?/g);
            if (nums && nums.length > 0) return Math.max(...nums.map(Number));
            return 0;
        };

        const counts = {};
        for (const deal of deals) {
            let prefCount = 0;
            const price = parseFloat(String(deal.price || deal.quotePrice || '').replace(/,/g, '')) || 0;
            const dealProj = String(deal.projectName || deal.inventoryId?.projectName || '').toLowerCase();
            const dealSector = String(deal.inventoryId?.sector || deal.sector || '').toLowerCase();
            const dealCity = String(deal.locationDetails?.city || deal.inventoryId?.address?.city || '').toLowerCase();
            const dealLoc = String(deal.location || deal.inventoryId?.address?.locality || '').toLowerCase();
            
            const dealSubCat = String(deal.subCategory?.lookup_value || deal.subCategory || deal.inventoryId?.subCategory?.lookup_value || deal.inventoryId?.subCategory || '').toLowerCase();
            const dealSizeDesc = [
                deal.sizeType, deal.inventoryId?.sizeType,
                deal.unitType, deal.inventoryId?.unitType,
                deal.sizeConfig, deal.inventoryId?.sizeConfig,
                deal.sizeLabel, deal.inventoryId?.sizeLabel,
                deal.unitSpecification?.sizeLabel, deal.inventoryId?.unitSpecification?.sizeLabel
            ].map(s => String(s?.lookup_value || s || '')).filter(Boolean).join(' ').toLowerCase();

            for (const lead of activeLeads) {
                const lMin = parseFloat(lead.budgetMin) || 0;
                const lMax = parseFloat(lead.budgetMax) || 0;
                const hasLeadBudget = lMax > 0;
                const isBudgetPref = hasLeadBudget ? (price > 0 && price >= lMin && price <= lMax) : false;
                
                let locMatchCount = 0;
                const leadSector = String(lead.sector || '').toLowerCase();
                const leadCity = String(lead.locCity || '').toLowerCase();
                const leadArea = String(lead.locArea || '').toLowerCase();
                const leadLocVal = String(lead.location || '').toLowerCase();
                const leadProjects = (Array.isArray(lead.projectName) ? lead.projectName : [lead.projectName]).filter(Boolean).map(p => String(p?.name || p || '').toLowerCase());
                
                if (leadProjects.length > 0 && leadProjects.some(p => p && dealProj.includes(p))) {
                    locMatchCount++;
                } else {
                    const locSignals = [
                        !!(leadArea && dealLoc && (dealLoc.includes(leadArea) || leadArea.includes(dealLoc))),
                        !!(leadSector && dealSector && (dealSector.includes(leadSector) || leadSector.includes(dealSector))),
                        !!(leadCity && dealCity && (dealCity.includes(leadCity) || leadCity.includes(dealCity))),
                        leadArea && dealProj.includes(leadArea)
                    ];
                    if (locSignals.filter(Boolean).length >= 1) locMatchCount++;
                }
                const hasLeadLocation = !!(leadLocVal || leadArea || leadSector || leadCity || leadProjects.length > 0);
                const isLocationPref = hasLeadLocation ? (locMatchCount >= 1) : false;
                
                const leadSubCats = (Array.isArray(lead.subType) ? lead.subType : []).map(s => getLookupVal(s)).filter(Boolean);
                const leadSizeTypes = (Array.isArray(lead.sizeType) ? lead.sizeType : []).map(s => getLookupVal(s)).filter(Boolean);
                const leadUnitTypes = (Array.isArray(lead.unitType) ? lead.unitType : []).map(u => getLookupVal(u)).filter(Boolean);

                const isSubCatMatch = leadSubCats.length === 0 || (dealSubCat && leadSubCats.some(c => dealSubCat.includes(c) || c.includes(dealSubCat)));
                const isSizeTypeMatch = leadSizeTypes.length === 0 || leadSizeTypes.some(s => dealSizeDesc.includes(s));
                const isUnitTypeMatch = leadUnitTypes.length === 0 || leadUnitTypes.some(u => dealSizeDesc.includes(u));
                const isTypePref = isSubCatMatch && isSizeTypeMatch && isUnitTypeMatch;

                const hasLeadArea = extractNumericSize(lead.areaMax) > 0;
                const leadHasData = [hasLeadBudget, hasLeadArea, hasLeadLocation].filter(Boolean).length;

                const isPreferredMatch = isBudgetPref && isLocationPref && isTypePref && leadHasData >= 2;
                
                if (isPreferredMatch) {
                    prefCount++;
                }
            }
            counts[deal._id.toString()] = prefCount;
        }
        return counts;
    } catch (e) {
        console.error("[BulkDealExactMatchCounts] Error:", e);
        return {};
    }
};

export const getExactMatchLeadsForDeal = async (deal) => {
    try {
        const Lead = (await import('../models/Lead.js')).default;
        const Lookup = (await import('../models/Lookup.js')).default;
        
        const activeLeads = await Lead.find({
            stage: { $nin: ['Closed', 'Lost', 'Junk', 'Unqualified', 'Sold Out'] }
        })
        .select('_id firstName lastName email mobile phone budgetMin budgetMax areaMin areaMax locCity locArea sector projectName requirement subType sizeType unitType location assignedTo')
        .populate('projectName', 'name')
        .lean();
        
        const allLookups = await Lookup.find({}).lean();
        const lookupIdMap = new Map(allLookups.map(l => [String(l._id), String(l.lookup_value || '').toLowerCase()]));

        const getLookupVal = (val) => {
            if (!val) return '';
            if (val.lookup_value) return String(val.lookup_value).toLowerCase();
            const idStr = String(val._id || val);
            const resolved = lookupIdMap.get(idStr);
            if (resolved) return resolved;
            if (!/^[0-9a-fA-F]{24}$/.test(idStr)) return idStr.toLowerCase();
            return '';
        };

        const extractNumericSize = (val) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            const clean = String(val).replace(/,/g, '');
            const nums = clean.match(/\d+(\.\d+)?/g);
            if (nums && nums.length > 0) return Math.max(...nums.map(Number));
            return 0;
        };

        const matchingLeads = [];
        const price = parseFloat(String(deal.price || deal.quotePrice || '').replace(/,/g, '')) || 0;
        const dealProj = String(deal.projectName || deal.inventoryId?.projectName || '').toLowerCase();
        const dealSector = String(deal.inventoryId?.sector || deal.sector || '').toLowerCase();
        const dealCity = String(deal.locationDetails?.city || deal.inventoryId?.address?.city || '').toLowerCase();
        const dealLoc = String(deal.location || deal.inventoryId?.address?.locality || '').toLowerCase();
        
        const dealSubCat = String(deal.subCategory?.lookup_value || deal.subCategory || deal.inventoryId?.subCategory?.lookup_value || deal.inventoryId?.subCategory || '').toLowerCase();
        const dealSizeDesc = [
            deal.sizeType, deal.inventoryId?.sizeType,
            deal.unitType, deal.inventoryId?.unitType,
            deal.sizeConfig, deal.inventoryId?.sizeConfig,
            deal.sizeLabel, deal.inventoryId?.sizeLabel,
            deal.unitSpecification?.sizeLabel, deal.inventoryId?.unitSpecification?.sizeLabel
        ].map(s => String(s?.lookup_value || s || '')).filter(Boolean).join(' ').toLowerCase();

        for (const lead of activeLeads) {
            const lMin = parseFloat(lead.budgetMin) || 0;
            const lMax = parseFloat(lead.budgetMax) || 0;
            const hasLeadBudget = lMax > 0;
            const isBudgetPref = hasLeadBudget ? (price > 0 && price >= lMin && price <= lMax) : false;
            
            let locMatchCount = 0;
            const leadSector = String(lead.sector || '').toLowerCase();
            const leadCity = String(lead.locCity || '').toLowerCase();
            const leadArea = String(lead.locArea || '').toLowerCase();
            const leadLocVal = String(lead.location || '').toLowerCase();
            const leadProjects = (Array.isArray(lead.projectName) ? lead.projectName : [lead.projectName]).filter(Boolean).map(p => String(p?.name || p || '').toLowerCase());
            
            if (leadProjects.length > 0 && leadProjects.some(p => p && dealProj.includes(p))) {
                locMatchCount++;
            } else {
                const locSignals = [
                    !!(leadArea && dealLoc && (dealLoc.includes(leadArea) || leadArea.includes(dealLoc))),
                    !!(leadSector && dealSector && (dealSector.includes(leadSector) || leadSector.includes(dealSector))),
                    !!(leadCity && dealCity && (dealCity.includes(leadCity) || leadCity.includes(dealCity))),
                    leadArea && dealProj.includes(leadArea)
                ];
                if (locSignals.filter(Boolean).length >= 1) locMatchCount++;
            }
            const hasLeadLocation = !!(leadLocVal || leadArea || leadSector || leadCity || leadProjects.length > 0);
            const isLocationPref = hasLeadLocation ? (locMatchCount >= 1) : false;
            
            const leadSubCats = (Array.isArray(lead.subType) ? lead.subType : []).map(s => getLookupVal(s)).filter(Boolean);
            const leadSizeTypes = (Array.isArray(lead.sizeType) ? lead.sizeType : []).map(s => getLookupVal(s)).filter(Boolean);
            const leadUnitTypes = (Array.isArray(lead.unitType) ? lead.unitType : []).map(u => getLookupVal(u)).filter(Boolean);

            const isSubCatMatch = leadSubCats.length === 0 || (dealSubCat && leadSubCats.some(c => dealSubCat.includes(c) || c.includes(dealSubCat)));
            const isSizeTypeMatch = leadSizeTypes.length === 0 || leadSizeTypes.some(s => dealSizeDesc.includes(s));
            const isUnitTypeMatch = leadUnitTypes.length === 0 || leadUnitTypes.some(u => dealSizeDesc.includes(u));
            const isTypePref = isSubCatMatch && isSizeTypeMatch && isUnitTypeMatch;

            const hasLeadArea = extractNumericSize(lead.areaMax) > 0;
            const leadHasData = [hasLeadBudget, hasLeadArea, hasLeadLocation].filter(Boolean).length;

            if (isBudgetPref && isLocationPref && isTypePref && leadHasData >= 2) {
                matchingLeads.push(lead);
            }
        }
        return matchingLeads;
    } catch (e) {
        console.error("[getExactMatchLeadsForDeal] Error:", e);
        return [];
    }
};
