import mongoose from 'mongoose';
import Deal from '../models/Deal.js';
import CollectorRate from '../models/CollectorRate.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import Lookup from '../models/Lookup.js';

// --- Helpers for Senior Professional Logic ---

const convertArea = (value, fromUnit, toUnit) => {
    if (!value || fromUnit === toUnit) return value;
    
    // Base unit: Sq Ft
    const toSqFt = {
        'Sq Ft': 1,
        'Sq.Ft.': 1,
        'Sq Yard': 9,
        'Sq.Yard': 9,
        'Sq Meter': 10.7639,
        'Acre': 43560,
        'Kanal': 5445, // Standard Punjab/Haryana Kanal
        'Marla': 272.25
    };

    const fromFactor = toSqFt[fromUnit] || 1;
    const toFactor = toSqFt[toUnit] || 1;

    const valInSqFt = value * fromFactor;
    return valInSqFt / toFactor;
};

const resolveLookupValue = async (idOrValue) => {
    if (!idOrValue) return '';
    if (mongoose.Types.ObjectId.isValid(idOrValue)) {
        const lookup = await Lookup.findById(idOrValue).lean();
        return lookup ? lookup.lookup_value : '';
    }
    return String(idOrValue);
};

export const calculateValuation = async (req, res) => {
    try {
        const { dealId, buyerGender = 'male', customMarketPrice } = req.body;

        const deal = await Deal.findById(dealId).populate('inventoryId projectId').lean();
        if (!deal) return res.status(404).json({ status: "error", message: "Deal not found" });

        const inventory = deal.inventoryId;
        if (!inventory) return res.status(404).json({ status: "error", message: "Inventory not linked to deal" });

        // 1. Resolve Category/SubCategory names for matching
        const categoryName = await resolveLookupValue(deal.category || inventory.category);
        const subCategoryName = await resolveLookupValue(deal.subCategory || inventory.subCategory);

        // 2. Resolve Location IDs
        const stateId = inventory.address?.state;
        const districtId = inventory.address?.district || inventory.address?.city;
        const tehsilId = inventory.address?.tehsil;
        const locationId = inventory.address?.location || inventory.address?.locality || inventory.address?.area;

        // 3. Find Matching Collector Rate
        const query = {
            state: stateId,
            district: districtId,
            category: categoryName,
            subCategory: subCategoryName
        };
        if (tehsilId) query.tehsil = tehsilId;
        if (locationId) query.location = locationId;

        const rate = await CollectorRate.findOne(query).sort({ effectiveFrom: -1 }).lean();

        if (!rate) {
            console.log("No rate found for query:", query);
            return res.status(400).json({ status: "error", message: `No collector rate found for ${categoryName}/${subCategoryName} in this location.` });
        }

        // 4. Calculate Collector Value with Unit Normalization
        let collectorValue = 0;
        const inventorySizeValue = inventory.size?.value || inventory.size || 0;
        const inventorySizeUnit = inventory.size?.unit || inventory.sizeUnit || 'Sq Ft';
        
        // Normalize area to rate unit
        const normalizedArea = convertArea(inventorySizeValue, inventorySizeUnit, rate.rateUnit);

        // Multipliers
        let multiplierFactor = 1;
        if (deal.roadType && rate.roadMultipliers) {
            const rm = rate.roadMultipliers.find(m => m.roadType === deal.roadType);
            if (rm) multiplierFactor += (rm.multiplier / 100);
        }
        if (deal.floor && rate.floorMultipliers) {
            const fm = rate.floorMultipliers.find(m => m.floorType === deal.floor);
            if (fm) multiplierFactor += (fm.multiplier / 100);
        }

        if (rate.rateApplyOn === 'Land Area') {
            collectorValue = normalizedArea * rate.rate * multiplierFactor;
        } else if (rate.rateApplyOn === 'Built-up Area') {
            const builtUpValue = inventory.builtUpArea?.value || 0;
            const builtUpUnit = inventory.builtUpArea?.unit || 'Sq Ft';
            const normalizedBuiltUp = convertArea(builtUpValue, builtUpUnit, rate.rateUnit);
            collectorValue = normalizedBuiltUp * rate.rate * multiplierFactor;
        } else {
            // Mixed: Land + Built-up (simplified to Land area if no separate rates exist, or use construction rate)
            collectorValue = normalizedArea * rate.rate * multiplierFactor;
            if (rate.constructionRateSqFt && inventory.builtUpArea?.value) {
                collectorValue += (inventory.builtUpArea.value * rate.constructionRateSqFt);
            }
        }

        // 5. Registry Value Logic based on Transaction Type
        const marketPrice = parseFloat(customMarketPrice || deal.price) || 0;
        const transactionType = deal.transactionType || 'Full White';
        const flexiblePercentage = (deal.flexiblePercentage !== undefined && deal.flexiblePercentage !== null) ? parseFloat(deal.flexiblePercentage) : 100;

        let registryValue = marketPrice; // Default to Full White

        if (transactionType === 'Collector Rate') {
            registryValue = collectorValue;
        } else if (transactionType === 'Flexible') {
            registryValue = marketPrice * (flexiblePercentage / 100);
        }

        // Legal Safety: Registry should not be below Collector Rate
        const stampDutyBase = Math.max(registryValue, collectorValue);

        // 6. Get State-Specific Config for Taxes
        let config = await SystemSetting.findOne({ 
            category: 'govt_charges_config', 
            'value.state': stateId 
        }).lean();

        // Fallback to global config if state-specific not found
        if (!config) {
            config = await SystemSetting.findOne({ category: 'govt_charges_config' }).lean();
        }

        const configValues = config?.value || {
            stampDutyMale: 7, stampDutyFemale: 5, stampDutyJoint: 6,
            registrationPercent: 1, legalFees: 15000
        };

        // 7. Final Calculations
        let stampDutyPercent = configValues.stampDutyMale || 7;
        if (buyerGender === 'female') stampDutyPercent = configValues.stampDutyFemale || 5;
        else if (buyerGender === 'joint') stampDutyPercent = configValues.stampDutyJoint || 6;

        const stampDutyAmount = (stampDutyBase * stampDutyPercent) / 100;
        const registrationAmount = (stampDutyBase * (configValues.registrationPercent || 1)) / 100;
        const totalCharges = stampDutyAmount + registrationAmount + (configValues.legalFees || 15000);

        const breakdown = {
            baseRate: rate.rate,
            rateUnit: rate.rateUnit,
            multiplierFactor,
            collectorValue,
            stampDutyBase,
            stampDutyPercent,
            registrationPercent: configValues.registrationPercent || 1,
            legalFees: configValues.legalFees || 15000
        };

        res.json({
            status: "success",
            data: {
                marketPrice,
                collectorValue,
                stampDutyBase,
                stampDutyAmount,
                registrationAmount,
                legalFees: configValues.legalFees || 15000,
                totalCharges,
                transactionType,
                flexiblePercentage,
                breakdown,
                matchedRate: {
                    id: rate._id,
                    configName: rate.configName
                }
            }
        });

    } catch (error) {
        console.error("Valuation Error:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};
