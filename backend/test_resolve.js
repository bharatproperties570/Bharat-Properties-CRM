import mongoose from 'mongoose';
import dotenv from 'dotenv';
import VariableResolutionService from './services/VariableResolutionService.js';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatproperties').then(async () => {
    const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    
    // Fetch deal 1599
    const d1599 = await Inventory.findOne({ unitNo: '1599' }).lean();
    const resolveLookupSafely = async (val) => {
        if (!val) return null;
        const strVal = val.toString();
        if (/^[a-fA-F0-9]{24}$/.test(strVal)) {
            const lkup = await Lookup.findById(strVal).lean();
            if (lkup) return lkup.lookup_value || lkup.name || lkup.label;
        }
        return null;
    };
    
    let base = d1599;
    if (base.subCategory) {
        const val = await resolveLookupSafely(base.subCategory);
        if (val) base.subCategory = { lookup_value: val };
    }
    if (base.sizeLabel) {
        const val = await resolveLookupSafely(base.sizeLabel);
        if (val) base.sizeLabel = val;
    }

    const lead = {
        matchedProperties: [ { inventoryId: base } ]
    };

    const res = VariableResolutionService.resolveForLeads(lead, { "1": "customer_name", "2": "property_list_default" });
    console.log(res);

    mongoose.connection.close();
});
