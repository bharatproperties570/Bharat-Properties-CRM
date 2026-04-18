import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bharat-crm";

async function repairMasterFields() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: String,
            value: mongoose.Schema.Types.Mixed,
            category: String,
            description: String,
            isPublic: Boolean
        }, { collection: 'systemsettings' }));

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String
        }, { collection: 'lookups' }));

        // 1. Fetch existing lookups to populate sources and statuses
        const sources = await Lookup.find({ lookup_type: 'Source' }).distinct('lookup_value');
        const statuses = await Lookup.find({ lookup_type: 'Status' }).distinct('lookup_value');

        // Defaults for Deal Status (Standard Pipeline)
        const dealStatuses = ["Open", "Quote", "Negotiation", "Booked", "Won", "Lost", "Cancelled"];
        const dealTypes = ["Registry case", "GPA case", "Lease case", "Agreement to Sell"];

        let masterFields = await SystemSetting.findOne({ key: 'leadMasterFields' });
        
        const defaultValues = {
            transactionTypes: ["Full White", "Full Cash", "Flexible", "Collector Rate"],
            fundingTypes: ["Self Funding", "Home Loan", "Loan Against Property", "Personal Loan", "Business Loan"],
            furnishingStatuses: ["Unfurnished", "Semi-Furnished", "Fully-Furnished"],
            timelines: ["Immediate", "Within 1 Month", "Within 3 Months", "Within 6 Months", "More than 6 Months"],
            dealStatuses: dealStatuses,
            dealTypes: dealTypes,
            transactionSources: sources.length > 0 ? sources : ["Walk-in", "Referral", "Website", "Google", "Facebook", "Instagram", "99Acres"]
        };

        if (masterFields) {
            console.log("Updating existing leadMasterFields...");
            masterFields.value = { ...defaultValues, ...masterFields.value };
            // Ensure the specific missing fields are overwritten if they were undefined
            masterFields.value.dealStatuses = masterFields.value.dealStatuses || defaultValues.dealStatuses;
            masterFields.value.dealTypes = masterFields.value.dealTypes || defaultValues.dealTypes;
            masterFields.value.transactionSources = masterFields.value.transactionSources || defaultValues.transactionSources;
            
            await masterFields.save();
        } else {
            console.log("Creating new leadMasterFields...");
            masterFields = new SystemSetting({
                key: 'leadMasterFields',
                value: defaultValues,
                category: 'crm',
                description: 'Master fields for lead and deal forms',
                isPublic: true
            });
            await masterFields.save();
        }

        console.log("Repair complete. Fields present:", Object.keys(masterFields.value));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

repairMasterFields();
