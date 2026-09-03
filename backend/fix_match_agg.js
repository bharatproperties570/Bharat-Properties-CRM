const fs = require('fs');
const path = '/home/ubuntu/bharat-properties-crm/backend/controllers/deal.controller.js';
let code = fs.readFileSync(path, 'utf8');

const regex = /\/\/ 🚀 ENTERPRISE PRE-FILTERING \(Database Level\)[\s\S]*?let deals = \[\];/;

const replacement = `// 🚀 ENTERPRISE PRE-FILTERING (Database Level via Aggregation)
        const validIntentIds = [];
        if (leadReq) {
            allLookups.filter(l => l.lookup_type === 'Intent').forEach(l => {
                const d = String(l.lookup_value).toLowerCase();
                let matched = false;
                if ((d.includes("sell") || d.includes("sale")) && (leadReq.includes("buy") || leadReq.includes("purchase") || leadReq.includes("req"))) matched = true;
                else if ((d.includes("rent") || d.includes("lease")) && (leadReq.includes("rent") || leadReq.includes("lease"))) matched = true;
                else if ((d.includes("buy") || d.includes("purchase")) && (leadReq.includes("sell") || leadReq.includes("sale"))) matched = true;
                else if (d === leadReq || d.includes(leadReq) || leadReq.includes(d)) matched = true;
                if (matched) validIntentIds.push(l._id);
            });
        }

        const validCategoryIds = [];
        if (leadCats.length > 0) {
            allLookups.filter(l => l.lookup_type === 'Category').forEach(l => {
                const d = String(l.lookup_value).toLowerCase();
                let matched = (
                    (d.includes("res") && leadCats.some(c => c.includes("res"))) ||
                    (d.includes("comm") && leadCats.some(c => c.includes("comm"))) ||
                    (d.includes("plot") && leadCats.some(c => c.includes("plot"))) ||
                    (d.includes("agri") && leadCats.some(c => c.includes("agri"))) ||
                    leadCats.some(c => d.includes(c) || c.includes(d))
                );
                if (matched) validCategoryIds.push(l._id);
            });
        }

        const aggMatchStage = { \: [] };

        if (validIntentIds.length > 0) {
            aggMatchStage.\.push({
                \: [ { activeIntent: { \: validIntentIds } }, { activeIntent: null }, { activeIntent: { \: false } } ]
            });
        }
        if (validCategoryIds.length > 0) {
            aggMatchStage.\.push({
                \: [ { activeCategory: { \: validCategoryIds } }, { activeCategory: null }, { activeCategory: { \: false } } ]
            });
        }
        
        if (lBudgetMin > 0 || lBudgetMax !== Infinity) {
            const bFlex = parseFloat(budgetFlexibility) / 100;
            const minB = lBudgetMin * (1 - bFlex);
            const maxB = lBudgetMax !== Infinity ? lBudgetMax * (1 + bFlex) : Infinity;
            
            aggMatchStage.\.push({
                \: [ { activePrice: { \: minB, \: maxB } }, { activePrice: { \: [null, 0, ""] } }, { activePrice: { \: false } } ]
            });
        }

        if (aggMatchStage.\.length === 0) delete aggMatchStage.\;
        let deals = [];`;

code = code.replace(regex, replacement);

const fetchRegex = /deals = await Deal\.find\(query\)\.populate\('inventoryId'\)\.lean\(\);/;
const fetchReplacement = `
            const basePipeline = [
                { \: query },
                { \: { from: 'inventories', localField: 'inventoryId', foreignField: '_id', as: 'inventoryId' } },
                { \: { path: '\', preserveNullAndEmptyArrays: true } },
                { \: { 
                    activeCategory: { \: ["\", "\.category"] },
                    activeIntent: { \: ["\", "\.intent"] },
                    activePrice: { \: [ { \: { input: "\", to: "double", onError: 0, onNull: 0 } }, { \: { input: "\", to: "double", onError: 0, onNull: 0 } }, { \: { input: "\.price", to: "double", onError: 0, onNull: 0 } } ] }
                }}
            ];
            if (aggMatchStage.\ && aggMatchStage.\.length > 0) basePipeline.push({ \: aggMatchStage });
            deals = await Deal.aggregate(basePipeline);
`;
code = code.replace(fetchRegex, fetchReplacement);

const fetchRegexGeo = /deals = await Deal\.find\(\{\s*\$or: \[\s*\{ _id: \{ \$in: geoDealIds \} \},\s*\{ \.\.\.query, geoPoint: \{ \$exists: false \} \}\s*\]\s*\}\)\.populate\('inventoryId'\)\.lean\(\);/;
const fetchReplacementGeo = `
            const geoPipeline = [
                { \: { \: [ { _id: { \: geoDealIds } }, { ...query, geoPoint: { \: false } } ] }},
                { \: { from: 'inventories', localField: 'inventoryId', foreignField: '_id', as: 'inventoryId' } },
                { \: { path: '\', preserveNullAndEmptyArrays: true } },
                { \: { 
                    activeCategory: { \: ["\", "\.category"] },
                    activeIntent: { \: ["\", "\.intent"] },
                    activePrice: { \: [ { \: { input: "\", to: "double", onError: 0, onNull: 0 } }, { \: { input: "\", to: "double", onError: 0, onNull: 0 } }, { \: { input: "\.price", to: "double", onError: 0, onNull: 0 } } ] }
                }}
            ];
            if (aggMatchStage.\ && aggMatchStage.\.length > 0) geoPipeline.push({ \: aggMatchStage });
            deals = await Deal.aggregate(geoPipeline);
`;
code = code.replace(fetchRegexGeo, fetchReplacementGeo);

fs.writeFileSync(path, code);
