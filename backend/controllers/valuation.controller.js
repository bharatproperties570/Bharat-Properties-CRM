import CollectorRate from '../models/CollectorRate.js';
import SystemSetting from '../models/SystemSetting.js';
import Deal from '../models/Deal.js';

export const calculateValuation = async (req, res) => {
    try {
        const { dealId, buyerGender = 'male', customMarketPrice } = req.body;

        const deal = await Deal.findById(dealId)
            .populate('inventoryId')
            .populate('projectId');
        if (!deal) return res.status(404).json({ status: "error", message: "Deal not found" });

        const inventory = deal.inventoryId;
        if (!inventory) return res.status(404).json({ status: "error", message: "Inventory not found" });

        // 1. Get Location Info (Strings from Deal/Inventory/Project)
        // Note: In an ideal world we'd have IDs, but here we search by name
        // 1. Get Location Info (Strings from Deal/Inventory/Project)
        const projectAddress = (deal.projectId && typeof deal.projectId === 'object') ? deal.projectId.address : {};

        const stateStr = projectAddress?.state || inventory.address?.state;
        const districtStr = inventory.city || projectAddress?.city;
        const tehsilStr = projectAddress?.tehsil || inventory.address?.tehsil;
        const locationStr = inventory.sector || projectAddress?.location || inventory.address?.location;

        console.log("Valuation Calc - Deal:", dealId);
        console.log(`Location: ${stateStr}, ${districtStr}, ${tehsilStr}, ${locationStr}`);

        // 2. Fetch Collector Rate with Priority Logic
        const findCollectorRate = async (category, subCategory) => {
            // Level 1: Exact Location
            let query = { category, subCategory, status: 'Active' };
            // Since we use Lookup refs, we match by lookup_value if available via populate OR just exact match strings
            // However, our backend getAllCollectorRates uses refs. 
            // For the Valuation Engine, we need to match strings. 
            // We'll perform a search on populated fields.

            const rates = await CollectorRate.find({ category, subCategory })
                .populate('state district tehsil location', 'lookup_value')
                .lean();

            const matchRate = (r, s, d, t, l) => {
                const sMatch = !s || r.state?.lookup_value?.toLowerCase() === s.toLowerCase();
                const dMatch = !d || r.district?.lookup_value?.toLowerCase() === d.toLowerCase();
                const tMatch = !t || r.tehsil?.lookup_value?.toLowerCase() === t.toLowerCase();
                const lMatch = !l || r.location?.lookup_value?.toLowerCase() === l.toLowerCase();
                return sMatch && dMatch && tMatch && lMatch;
            };

            // Rank Matches
            let best = rates.find(r => matchRate(r, stateStr, districtStr, tehsilStr, locationStr));
            if (!best) best = rates.find(r => matchRate(r, stateStr, districtStr, tehsilStr, null));
            if (!best) best = rates.find(r => matchRate(r, stateStr, districtStr, null, null));

            return best;
        };

        const rate = await findCollectorRate(deal.category, deal.subCategory);

        console.log("Found Rate:", rate ? rate._id : "None");

        if (!rate) {
            console.log("No rate found for:", deal.category, deal.subCategory);
            return res.status(400).json({ status: "error", message: `No collector rate found for ${deal.category}/${deal.subCategory} in this location.` });
        }

        // 3. Calculation Logic
        let collectorValue = 0;
        let breakdown = {
            baseRate: rate.rate,
            rateUnit: rate.rateUnit,
            applyOn: rate.rateApplyOn,
            multipliers: []
        };

        const plotArea = inventory.size || 0;
        const builtUpArea = inventory.builtUpArea || 0;

        // Multipliers
        const roadWidth = inventory.roadWidth || '';
        const floor = inventory.floor || '';

        const matchingRoad = rate.roadMultipliers?.find(m =>
            roadWidth.toLowerCase().includes(m.roadType.toLowerCase()) ||
            m.roadType.toLowerCase().includes(roadWidth.toLowerCase())
        );
        const matchingFloor = rate.floorMultipliers?.find(m =>
            floor.toString().toLowerCase() === m.floorType.toLowerCase() ||
            m.floorType.toLowerCase().includes(floor.toString().toLowerCase())
        );

        const roadMultiplier = matchingRoad ? (matchingRoad.multiplier / 100) : 0;
        const floorMultiplier = matchingFloor ? (matchingFloor.multiplier / 100) : 0;

        if (matchingRoad) breakdown.multipliers.push({ type: 'Road', name: matchingRoad.roadType, percent: matchingRoad.multiplier });
        if (matchingFloor) breakdown.multipliers.push({ type: 'Floor', name: matchingFloor.floorType, percent: matchingFloor.multiplier });

        const multiplierFactor = 1 + roadMultiplier + floorMultiplier;

        // Implementation of Case 1, 2, 3
        if (rate.rateApplyOn === 'Land Area') {
            collectorValue = plotArea * rate.rate * multiplierFactor;
            breakdown.formula = `${plotArea} (Area) x ${rate.rate} (Rate) x ${multiplierFactor} (Multipliers)`;
        }
        else if (rate.rateApplyOn === 'Built-up Area') {
            collectorValue = builtUpArea * rate.rate * multiplierFactor;
            breakdown.formula = `${builtUpArea} (Built-up) x ${rate.rate} (Rate) x ${multiplierFactor} (Multipliers)`;
        }
        else if (rate.rateApplyOn === 'Land + Built-up') {
            // For Houses, we need Construction Rate
            // We'll search for a rate with category 'Residential' and subCategory 'Construction' or similar
            const constructionRateObj = await findCollectorRate('Residential', 'Construction') || { rate: 1200 }; // Fallback
            const landValue = plotArea * rate.rate * (1 + roadMultiplier);
            const constructionValue = builtUpArea * constructionRateObj.rate * (1 + floorMultiplier);
            collectorValue = landValue + constructionValue;

            breakdown.landValue = landValue;
            breakdown.constructionValue = constructionValue;
            breakdown.formula = `(${plotArea} x ${rate.rate} [Land]) + (${builtUpArea} x ${constructionRateObj.rate} [Construction])`;
        }

        // 4. Market vs Collector Comparison
        const marketPrice = customMarketPrice || deal.price || 0;
        const stampDutyBase = Math.max(marketPrice, collectorValue);

        // 5. Get Global Config for Taxes
        const configRef = await SystemSetting.findOne({ category: 'govt_charges_config' }).lean();
        const config = configRef?.value || { stampDutyMale: 7, stampDutyFemale: 5, stampDutyJoint: 6, registrationPercent: 1, legalFees: 15000 };

        let sdPercent = config.stampDutyMale;
        if (buyerGender === 'female') sdPercent = config.stampDutyFemale;
        else if (buyerGender === 'joint') sdPercent = config.stampDutyJoint;

        const stampDutyAmount = stampDutyBase * (sdPercent / 100);

        let registrationAmount = 0;
        if (config.registrationMode === 'slab' && config.registrationSlabs?.length > 0) {
            const slab = config.registrationSlabs.find(s =>
                stampDutyBase >= s.min && (!s.max || stampDutyBase <= s.max)
            );
            if (slab) {
                registrationAmount = slab.type === 'fixed' ? slab.value : (stampDutyBase * slab.value / 100);
            }
        } else {
            registrationAmount = stampDutyBase * (config.registrationPercent / 100);
        }

        const totalCharges = stampDutyAmount + registrationAmount + (config.legalFees || 0);

        res.json({
            status: "success",
            data: {
                collectorValue,
                marketPrice,
                stampDutyBase,
                stampDutyAmount,
                registrationAmount,
                legalFees: config.legalFees,
                totalCharges,
                breakdown,
                matchedRate: {
                    id: rate._id,
                    category: rate.category,
                    subCategory: rate.subCategory,
                    location: rate.location?.lookup_value
                }
            }
        });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};
