import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deal from './models/Deal.js';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';
import Inventory from './models/Inventory.js'; // imported to register schema

dotenv.config({ path: './.env' });

async function testMatch() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        // Find a deal
        const deal = await Deal.findOne({}).populate('inventoryId').lean();
        if (!deal) {
            console.log('No deal found.');
            await mongoose.disconnect();
            return;
        }

        console.log('Testing match for Deal ID:', deal._id);
        const bFlex = 0.20;
        const sFlex = 0.20;

        const getNum = (v) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'object' && v !== null) return Number(v.value || 0);
            return Number(v || 0);
        };
        
        let dealSize = getNum(deal.size);
        if (dealSize === 0 && deal.inventoryId) {
            dealSize = getNum(deal.inventoryId.length) * getNum(deal.inventoryId.width);
        }
        const dealPrice = getNum(deal.price || deal.quotePrice);

        const allLookups = await Lookup.find({}).lean();
        const lookupMap = allLookups.reduce((acc, l) => {
            acc[l._id.toString()] = String(l.lookup_value).toLowerCase();
            return acc;
        }, {});

        const lookupLabelMap = allLookups.reduce((acc, l) => {
            acc[l._id.toString()] = l.lookup_value;
            return acc;
        }, {});

        const getLookupValLocal = (val) => {
            if (!val) return "";
            if (val.lookup_value) return String(val.lookup_value).toLowerCase();
            const idStr = (val._id || val).toString();
            return lookupMap[idStr] || (/^[0-9a-fA-F]{24}$/.test(idStr) ? "" : idStr.toLowerCase());
        };

        const getLookupLabelLocal = (val) => {
            if (!val) return "";
            if (val.lookup_value) return val.lookup_value;
            const idStr = (val._id || val).toString();
            return lookupLabelMap[idStr] || (/^[0-9a-fA-F]{24}$/.test(idStr) ? "" : idStr);
        };

        const dealIntent   = getLookupValLocal(deal.intent);
        const dealCategory = getLookupValLocal(deal.category);
        const dealLoc      = getLookupValLocal(deal.location);

        const excludedStatusIds = allLookups
            .filter(l => ["Lost", "Closed", "Rejected"].includes(l.lookup_value))
            .map(l => l._id.toString());

        const leads = await Lead.find({ 
            status: { $nin: excludedStatusIds } 
        }).lean();

        console.log(`Evaluating ${leads.length} leads...`);

        const matchingLeads = [];
        for (const lead of leads) {
            let score = 0;
            const reasons = [];

            const leadReq = getLookupValLocal(lead.requirement);
            const intentMatched = (() => {
                if (!dealIntent || !leadReq) return true;
                const d = dealIntent.toLowerCase();
                const l = leadReq.toLowerCase();
                if ((d.includes("sell") || d.includes("sale")) && (l.includes("buy") || l.includes("purchase") || l.includes("req"))) return true;
                if ((d.includes("rent") || d.includes("lease")) && (l.includes("rent") || l.includes("lease"))) return true;
                if ((l.includes("buy") || l.includes("purchase")) && (d.includes("sale") || d.includes("sell"))) return true;
                if (d === l || d.includes(l) || l.includes(d)) return true;
                return false;
            })();
            
            if (!intentMatched) continue;

            const leadCats = (Array.isArray(lead.propertyType) ? lead.propertyType : []).map(c => getLookupValLocal(c));
            let catScore = 0;
            if (!dealCategory || leadCats.length === 0 || leadCats.every(c => !c)) {
                catScore = 85;
            } else if (leadCats.some(c => c && (
                c.includes(dealCategory) || 
                dealCategory.includes(c) || 
                (dealCategory.includes("res") && c.includes("res")) || 
                (dealCategory.includes("comm") && c.includes("comm")) ||
                (dealCategory.includes("plot") && c.includes("plot")) ||
                (dealCategory.includes("agri") && c.includes("agri"))
            ))) {
                catScore = 100;
                reasons.push("Category Alignment");
            } else {
                catScore = 40;
            }
            score += (catScore * 0.30);

            const leadLocVal = getLookupValLocal(lead.location);
            const leadLocArea = String(lead.locArea || "").toLowerCase();
            let locScore = 0;
            if (dealLoc && (
                dealLoc === leadLocVal || 
                dealLoc.includes(leadLocVal) || 
                leadLocVal.includes(dealLoc) || 
                dealLoc.includes(leadLocArea) ||
                (leadLocArea && dealLoc.includes(leadLocArea))
            )) {
                locScore = 100;
                reasons.push("Location Match");
            } else if (!dealLoc || !leadLocVal) {
                locScore = 50; 
            }
            score += (locScore * 0.35);

            const lMin = getNum(lead.budgetMin);
            const lMax = getNum(lead.budgetMax);
            let budgetScore = 0;
            if (dealPrice > 0 && lMax > 0) {
                const minAcc = lMin * (1 - bFlex);
                const maxAcc = lMax * (1 + bFlex);
                if (dealPrice >= minAcc && dealPrice <= maxAcc) {
                    budgetScore = 100;
                    reasons.push("Budget Fit");
                }
            } else if (dealPrice > 0) {
                budgetScore = 60;
            }
            score += (budgetScore * 0.20);

            const aMin = getNum(lead.areaMin);
            const aMax = getNum(lead.areaMax);
            let sizeScore = 0;
            if (dealSize > 0 && aMax > 0) {
                const minAcc = aMin * (1 - sFlex);
                const maxAcc = aMax * (1 + sFlex);
                if (dealSize >= minAcc && dealSize <= maxAcc) {
                    sizeScore = 100;
                    reasons.push("Size Fit");
                }
            } else if (dealSize > 0) {
                sizeScore = 60;
            }
            score += (sizeScore * 0.15);

            if (score < 30) continue;

            const leadReqLabel = getLookupLabelLocal(lead.requirement) || "Buy";
            const leadBudgetLabel = getLookupLabelLocal(lead.budget) || "";
            const leadLocLabel = getLookupLabelLocal(lead.location) || "";
            const leadCatsLabels = (Array.isArray(lead.propertyType) ? lead.propertyType : [])
                .map(c => getLookupLabelLocal(c))
                .filter(Boolean);

            matchingLeads.push({
                name: `${lead.firstName} ${lead.lastName || ''}`.trim(),
                score: Math.round(score),
                budgetMin: lead.budgetMin,
                budgetMax: lead.budgetMax,
                budget: { lookup_value: leadBudgetLabel }
            });
        }

        console.log('Matches length:', matchingLeads.length);
        console.log('Sample Matches (top 5):', JSON.stringify(matchingLeads.sort((a,b) => b.score - a.score).slice(0, 5), null, 2));

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
    }
}

testMatch();
