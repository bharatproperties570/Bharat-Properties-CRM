import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const mongoUri = process.env.MONGODB_URI;

// Schemas
const DealSchema = new mongoose.Schema({}, { strict: false });
const LeadSchema = new mongoose.Schema({}, { strict: false });
const InventorySchema = new mongoose.Schema({}, { strict: false });
const LookupSchema = new mongoose.Schema({}, { strict: false });

const Deal = mongoose.models.Deal || mongoose.model('Deal', DealSchema, 'deals');
const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema, 'leads');
const Inventory = mongoose.models.Inventory || mongoose.model('Inventory', InventorySchema, 'inventories');
const Lookup = mongoose.models.Lookup || mongoose.model('Lookup', LookupSchema, 'lookups');

async function testMatch() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const dealId = '6a0ad751ee8126a476a15553';
        const deal = await Deal.findById(dealId).lean();
        if (!deal) {
            console.log("Deal not found");
            process.exit(0);
        }

        let inventory = null;
        if (deal.inventoryId) {
            inventory = await Inventory.findById(deal.inventoryId).lean();
        }

        const bFlex = 20 / 100;
        const sFlex = 20 / 100;

        const getNum = (v) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'object' && v !== null) return Number(v.value || 0);
            return Number(v || 0);
        };
        
        let dealSize = getNum(deal.size);
        if (dealSize === 0 && inventory) {
            dealSize = getNum(inventory.length) * getNum(inventory.width);
        }
        const dealPrice = getNum(deal.price || deal.quotePrice);

        const allLookups = await Lookup.find({}).lean();
        const lookupMap = allLookups.reduce((acc, l) => {
            acc[l._id.toString()] = String(l.lookup_value).toLowerCase();
            return acc;
        }, {});

        const getLookupValLocal = (val) => {
            if (!val) return "";
            if (val.lookup_value) return String(val.lookup_value).toLowerCase();
            const idStr = (val._id || val).toString();
            return lookupMap[idStr] || (/^[0-9a-fA-F]{24}$/.test(idStr) ? "" : idStr.toLowerCase());
        };

        const dealIntent   = getLookupValLocal(deal.intent);
        const dealCategory = getLookupValLocal(deal.category);
        const dealLoc      = getLookupValLocal(deal.location);

        console.log(`\n--- DEAL CONTEXT ---`);
        console.log(`Intent: "${dealIntent}"`);
        console.log(`Category: "${dealCategory}"`);
        console.log(`Location: "${dealLoc}"`);
        console.log(`Price: ${dealPrice}`);
        console.log(`Size: ${dealSize}`);

        const excludedStatusIds = allLookups
            .filter(l => ["Lost", "Closed", "Rejected"].includes(l.lookup_value))
            .map(l => l._id.toString());

        const leads = await Lead.find({ 
            status: { $nin: excludedStatusIds } 
        }).lean();

        console.log(`\nEvaluating ${leads.length} active leads:`);

        let matchCount = 0;
        for (let lead of leads) {
            
            // A. Intent Resolution
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

            if (!intentMatched) {
                continue;
            }

            // B. Category Resolution
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
            } else {
                catScore = 40; 
            }

            // C. Location Intelligence
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
            } else if (!dealLoc || !leadLocVal) {
                locScore = 50; 
            }

            // D. Budget Intelligence
            const lMin = getNum(lead.budgetMin);
            const lMax = getNum(lead.budgetMax);
            
            let budgetScore = 0;
            if (dealPrice > 0 && lMax > 0) {
                const minAcc = lMin * (1 - bFlex);
                const maxAcc = lMax * (1 + bFlex);
                if (dealPrice >= minAcc && dealPrice <= maxAcc) {
                    budgetScore = 100;
                }
            } else if (dealPrice > 0) {
                budgetScore = 60;
            }

            // E. Size Intelligence
            const aMin = getNum(lead.areaMin);
            const aMax = getNum(lead.areaMax);
            
            let sizeScore = 0;
            if (dealSize > 0 && aMax > 0) {
                const minAcc = aMin * (1 - sFlex);
                const maxAcc = aMax * (1 + sFlex);
                if (dealSize >= minAcc && dealSize <= maxAcc) {
                    sizeScore = 100;
                }
            } else if (dealSize > 0) {
                sizeScore = 60;
            }

            let score = (catScore * 0.30) + (locScore * 0.35) + (budgetScore * 0.20) + (sizeScore * 0.15);
            if (score >= 30) {
                matchCount++;
                console.log(`\nMatched Lead: ${lead.firstName} ${lead.lastName || ''} (${lead.mobile})`);
                console.log(`  - Requirement: "${leadReq}"`);
                console.log(`  - Property Types:`, leadCats);
                console.log(`  - Location (Lookup): "${leadLocVal}" | (Text): "${leadLocArea}"`);
                console.log(`  - Budget Range: ${lMin} - ${lMax}`);
                console.log(`  - Size Range: ${aMin} - ${aMax}`);
                console.log(`  - Scores: Cat=${catScore}, Loc=${locScore}, Budget=${budgetScore}, Size=${sizeScore} | Total=${score}`);
            }
        }

        console.log(`\nTotal matched leads: ${matchCount}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testMatch();
