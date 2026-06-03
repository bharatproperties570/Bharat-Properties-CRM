import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        const Lead = (await import('./models/Lead.js')).default;
        const Deal = (await import('./models/Deal.js')).default;
        const Inventory = (await import('./models/Inventory.js')).default;
        const Lookup = (await import('./models/Lookup.js')).default;

        const lead = await Lead.findById('6a1eebf7fa0dbcb534d4f960').lean();
        const deal = await Deal.findOne({ unitNo: '1412' }).populate('inventoryId').lean();

        if (!lead || !deal) {
            console.log("Missing lead or deal"); process.exit(1);
        }

        const allLookups = await Lookup.find().lean();
        const lookupIdMap = new Map(allLookups.map(l => [String(l._id), l.lookup_value]));

        const getLookupValueLocal = (val) => {
            if (!val) return "";
            if (val.lookup_value) return String(val.lookup_value).toLowerCase();
            const idStr = String(val._id || val);
            const resolved = lookupIdMap.get(idStr);
            if (resolved) return resolved.toLowerCase();
            if (!/^[0-9a-fA-F]{24}$/.test(idStr)) return idStr.toLowerCase();
            return "";
        };

        const extractNumericSize = (val) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            let clean = String(val).replace(/,/g, '');
            const match = clean.match(/\d+(\.\d+)?/g);
            if (match && match.length > 0) {
                return Math.max(...match.map(Number));
            }
            return 0;
        };

        const convertToSqYd = (val, unit) => {
            let num = extractNumericSize(val);
            if (isNaN(num)) return 0;
            if (!unit) return num;
            const u = unit.toLowerCase().trim();
            if (u.includes('sq.yd') || u.includes('sqyd') || u.includes('sq. yard') || u.includes('sq yard') || u.includes('gaj') || u.includes('gaz')) return num;
            if (u.includes('sq.ft') || u.includes('sqft') || u.includes('sq ft')) return num / 9.0;
            if (u.includes('sq.m') || u.includes('sqm') || u.includes('sq meter') || u.includes('mtr')) return num * 1.19599;
            if (u.includes('kanal')) return num * 605;
            if (u.includes('marla')) return num * 30.25;
            if (u.includes('acre')) return num * 4840;
            if (u.includes('hectare')) return num * 11959.9;
            return num;
        };

        // Replicate LOCATION setup
        const leadLocCity = getLookupValueLocal(lead.locCity);
        const leadSector = String(lead.sector || "").toLowerCase();
        
        const dealCity = getLookupValueLocal(deal.locationDetails?.city || deal.inventoryId?.address?.city || deal.inventoryId?.locationDetails?.city);
        const dealSectorValue = getLookupValueLocal(deal.locationDetails?.locality || deal.locationDetails?.area || deal.sector || deal.inventoryId?.sector);
        
        console.log("=== LOCATION DEBUG ===");
        console.log("Lead City:", leadLocCity);
        console.log("Lead Sector:", leadSector);
        console.log("Deal City:", dealCity);
        console.log("Deal Sector:", dealSectorValue);
        
        const locSignalsMatch = [
            leadSector && dealSectorValue && (dealSectorValue.includes(leadSector) || leadSector.includes(dealSectorValue)),
            leadLocCity && dealCity && (dealCity.includes(leadLocCity) || leadLocCity.includes(dealCity)),
        ];
        console.log("Signals matched:", locSignalsMatch);

        // Replicate SIZE setup
        const sFlex = 20 / 100;
        const leadAreaUnit = lead.areaMetric || 'Sq.Yd.';
        const leadAreaMinNorm = convertToSqYd(lead.areaMin, leadAreaUnit);
        const leadAreaMaxNorm = convertToSqYd(lead.areaMax, leadAreaUnit);

        let rawDealSizeNum = 0;
        let rawDealSizeStr = null;
        const configStr = getLookupValueLocal(deal.unitSpecification?.sizeLabel || deal.sizeConfig || deal.inventoryId?.sizeConfig || deal.inventoryId?.unitSpecification?.sizeLabel);
        
        if (configStr) {
            rawDealSizeStr = configStr;
        } else if (deal.size && deal.size.value > 0) {
            rawDealSizeStr = deal.size.value;
        } else if (deal.inventoryId?.size && deal.inventoryId.size.value > 0) {
            rawDealSizeStr = deal.inventoryId.size.value;
        } else if (typeof deal.size === 'string' && deal.size.trim() !== '0') {
            rawDealSizeStr = deal.size;
        }

        if (rawDealSizeStr) {
            rawDealSizeNum = extractNumericSize(rawDealSizeStr);
        }

        const dealSizeUnit = deal.sizeUnit || deal.inventoryId?.size?.unit || deal.inventoryId?.sizeUnit || 'Sq.Yd.';
        const dealSizeNorm = convertToSqYd(rawDealSizeStr, dealSizeUnit);

        console.log("=== SIZE DEBUG ===");
        console.log("Config String:", configStr);
        console.log("Raw Deal Size Str:", rawDealSizeStr);
        console.log("Raw Deal Size Num:", rawDealSizeNum);
        console.log("Deal Size Unit:", dealSizeUnit);
        console.log("Deal Size Norm (SqYd):", dealSizeNorm);
        console.log("Lead Area Min Norm:", leadAreaMinNorm);
        console.log("Lead Area Max Norm:", leadAreaMaxNorm);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
run();
