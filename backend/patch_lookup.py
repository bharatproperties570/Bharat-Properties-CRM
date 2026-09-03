import re

with open('/home/ubuntu/bharat-properties-crm/backend/controllers/deal.controller.js', 'r') as f:
    content = f.read()

# 1. Replace the Promise.all section
old_promise = """        const lookupTypes = ['Category', 'Intent', 'SubCategory', 'Status', 'PropertyType', 'UnitType', 'Locality', 'Area', 'Location', 'Size', 'City', 'State'];
        const [results, categoryCounts, allLookups] = await Promise.all([
            paginate(Deal, query, Number(page), Number(limit), sortOption, dealListPopulateFields, null, dealListProjection),
            categoryStatsPromise,
            Lookup.find({ lookup_type: { $in: lookupTypes } }).select('_id lookup_type lookup_value').lean()
        ]);"""

new_promise = """        const [results, categoryCounts] = await Promise.all([
            paginate(Deal, query, Number(page), Number(limit), sortOption, dealListPopulateFields, null, dealListProjection),
            categoryStatsPromise
        ]);"""

if old_promise not in content:
    print("Error: Could not find old_promise")
    exit(1)

content = content.replace(old_promise, new_promise)

# 2. Replace the Lookup Resolution section
old_resolution = """        // --- [ENTERPRISE HARDENING]: Live Multi-Source Sync & Manual Lookup Resolution ---
        // 🚀 PHASE 2.3-S OPT2: allLookups already fetched in parallel above — just build maps
        console.time("getDeals_Lookup_Resolution");
        const lookupMap = new Map(allLookups.map(l => [String(l._id), l]));
        const lookupValueMap = new Map(allLookups.map(l => [String(l.lookup_value).toLowerCase(), l]));

        const enrichWithLookup = (item, field) => {
            const val = item[field];
            if (!val) return;
            if (isValidObjectId(val)) {
                item[field] = lookupMap.get(String(val)) || val;
            } else if (typeof val === 'string') {
                item[field] = lookupValueMap.get(val.toLowerCase()) || { lookup_value: val };
            }
        };"""

new_resolution = """        // --- [ENTERPRISE HARDENING]: Live Multi-Source Sync & Manual Lookup Resolution ---
        console.time("getDeals_Lookup_Resolution");
        
        // 🚀 PHASE 2.6-A FIX: Targeted Lookup Fetch (Extract only required IDs/Strings)
        const lookupIdSet = new Set();
        const lookupStringSet = new Set();

        const extractRef = (val) => {
            if (!val) return;
            if (isValidObjectId(val)) lookupIdSet.add(String(val));
            else if (typeof val === 'string') lookupStringSet.add(val.toLowerCase().trim());
        };

        results.records.forEach(deal => {
            extractRef(deal.category);
            extractRef(deal.subCategory);
            extractRef(deal.propertyType);
            extractRef(deal.intent);
            extractRef(deal.status);
            extractRef(deal.location);
            extractRef(deal.unitType);
            extractRef(deal.sizeConfig);

            const invId = deal.inventoryId?._id || deal.inventoryId;
            let inventory = invId ? inventoryMap.get(String(invId)) : null;
            if (!inventory && typeof deal.inventoryId === 'object' && deal.inventoryId !== null && deal.inventoryId._id) {
                inventory = deal.inventoryId;
            }
            if (!inventory && deal.projectName && deal.unitNo) {
                const key = `${String(deal.projectName).toLowerCase().trim()}_${String(deal.unitNo).toLowerCase().trim()}`;
                inventory = unlinkedInventoryMap.get(key);
            }

            if (inventory) {
                extractRef(inventory.location);
                extractRef(inventory.category);
                extractRef(inventory.propertyType);
                extractRef(inventory.unitType);
                extractRef(inventory.sizeConfig);
            }
        });

        const lookupQuery = {};
        const conditions = [];
        if (lookupIdSet.size > 0) {
            conditions.push({ _id: { $in: Array.from(lookupIdSet) } });
        }
        if (lookupStringSet.size > 0) {
            const regexes = Array.from(lookupStringSet).map(s => new RegExp(`^\\\\s*${escapeRegExp(s)}\\\\s*$`, 'i'));
            conditions.push({ lookup_value: { $in: regexes } });
        }

        let allLookups = [];
        if (conditions.length > 0) {
            lookupQuery.$or = conditions;
            allLookups = await Lookup.find(lookupQuery).select('_id lookup_type lookup_value').lean();
        }

        const lookupMap = new Map(allLookups.map(l => [String(l._id), l]));
        const lookupValueMap = new Map(allLookups.map(l => [String(l.lookup_value).toLowerCase().trim(), l]));

        const enrichWithLookup = (item, field) => {
            const val = item[field];
            if (!val) return;
            if (isValidObjectId(val)) {
                item[field] = lookupMap.get(String(val)) || val;
            } else if (typeof val === 'string') {
                item[field] = lookupValueMap.get(val.toLowerCase().trim()) || { lookup_value: val };
            }
        };"""

if old_resolution not in content:
    print("Error: Could not find old_resolution")
    exit(1)

content = content.replace(old_resolution, new_resolution)

with open('/home/ubuntu/bharat-properties-crm/backend/controllers/deal.controller.js', 'w') as f:
    f.write(content)

print("Patch applied successfully.")
