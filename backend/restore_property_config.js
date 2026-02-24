
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const SystemSettingSchema = new mongoose.Schema({
    key: String,
    category: String,
    value: mongoose.Schema.Types.Mixed,
    isPublic: Boolean,
    description: String
}, { timestamps: true });

const SystemSetting = mongoose.model('SystemSetting', SystemSettingSchema);

// Static data from propertyData.js (simplified version for restoration)
const PROPERTY_CATEGORIES = {
    "Residential": {
        subCategories: [
            {
                name: "Plot",
                types: [
                    { name: "1 Kanal", builtupTypes: [] },
                    { name: "2 Kanal", builtupTypes: [] },
                    { name: "16 Marla", builtupTypes: [] },
                    { name: "14 Marla", builtupTypes: [] },
                    { name: "10 Marla", builtupTypes: [] },
                    { name: "8 Marla", builtupTypes: [] },
                    { name: "6 Marla", builtupTypes: [] },
                    { name: "4 Marla", builtupTypes: [] },
                    { name: "3 Marla", builtupTypes: [] },
                    { name: "2 Marla", builtupTypes: [] }
                ]
            },
            {
                name: "Independent House",
                types: [
                    { name: "1 Kanal", builtupTypes: [] },
                    { name: "2 Kanal", builtupTypes: [] },
                    { name: "10 Marla", builtupTypes: [] },
                    { name: "8 Marla", builtupTypes: [] },
                    { name: "6 Marla", builtupTypes: [] }
                ]
            },
            {
                name: "Flat/Apartment",
                types: [
                    { name: "1 BHK", builtupTypes: ["Store", "Servant Room"] },
                    { name: "2 BHK", builtupTypes: ["Store", "Servant Room", "Study"] },
                    { name: "3 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] },
                    { name: "4 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] },
                    { name: "5 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] },
                    { name: "Studio", builtupTypes: [] }
                ]
            },
            {
                name: "Builder Floor",
                types: [
                    { name: "1 BHK", builtupTypes: ["Store", "Servant Room"] },
                    { name: "2 BHK", builtupTypes: ["Store", "Servant Room", "Study"] },
                    { name: "3 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] },
                    { name: "4 BHK", builtupTypes: ["Store", "Servant Room", "Pooja Room"] }
                ]
            }
        ]
    },
    "Commercial": {
        subCategories: [
            { name: "Shop", types: [{ name: "Booth", builtupTypes: [] }, { name: "Kiosk", builtupTypes: [] }] },
            { name: "Showroom", types: [{ name: "SCO", builtupTypes: [] }, { name: "SCF", builtupTypes: [] }, { name: "DSS", builtupTypes: [] }] },
            { name: "Office Space", types: [{ name: "Locable Office", builtupTypes: [] }, { name: "Virtual Office", builtupTypes: [] }] },
            { name: "Retail Store", types: [{ name: "Hyper Market", builtupTypes: [] }, { name: "Departmental Store", builtupTypes: [] }] },
            { name: "SOHO", types: [{ name: "SOHO", builtupTypes: [] }] },
            { name: "Executive Room", types: [{ name: "Room", builtupTypes: [] }] },
            { name: "Multiplex", types: [{ name: "Multiplex", builtupTypes: [] }] },
            { name: "Virtual Space", types: [{ name: "Virtual Space", builtupTypes: [] }] },
            { name: "Plot", types: [{ name: "Commercial Plot", builtupTypes: [] }] }
        ]
    },
    "Institutional": {
        subCategories: [
            { name: "School", types: [{ name: "Nursery School", builtupTypes: [] }, { name: "Crech", builtupTypes: [] }, { name: "High School", builtupTypes: [] }, { name: "Primary School", builtupTypes: [] }] },
            { name: "Hotel", types: [{ name: "Hotel", builtupTypes: [] }, { name: "Guest House", builtupTypes: [] }, { name: "Homestays", builtupTypes: [] }] },
            { name: "Universities", types: [{ name: "Deemed", builtupTypes: [] }, { name: "Private", builtupTypes: [] }] },
            { name: "Hospital", types: [{ name: "Nursing Home", builtupTypes: [] }, { name: "Clinic", builtupTypes: [] }] },
            { name: "College", types: [{ name: "Art College", builtupTypes: [] }, { name: "Technical College", builtupTypes: [] }, { name: "Medical College", builtupTypes: [] }] }
        ]
    },
    "Industrial": {
        subCategories: [
            { name: "Plot", types: [{ name: "1 Kanal", builtupTypes: [] }, { name: "10 Marla", builtupTypes: [] }, { name: "2 Kanal", builtupTypes: [] }, { name: "1 Acre", builtupTypes: [] }] },
            { name: "Warehouse", types: [{ name: "WRHSE", builtupTypes: [] }] },
            { name: "Cold Storage", types: [{ name: "CLDSTRG", builtupTypes: [] }] },
            { name: "Rice Seller", types: [{ name: "RCSLR", builtupTypes: [] }] },
            { name: "Building", types: [{ name: "BLDG", builtupTypes: [] }] },
            { name: "Factory", types: [{ name: "FCTRY", builtupTypes: [] }] }
        ]
    },
    "Agricultural": {
        subCategories: [
            { name: "Land", types: [{ name: "Cropland", builtupTypes: [] }, { name: "Woodland", builtupTypes: [] }, { name: "Pasture", builtupTypes: [] }, { name: "Commercial", builtupTypes: [] }, { name: "Farm", builtupTypes: [] }] },
            { name: "Farm House", types: [{ name: "Farm House", builtupTypes: [] }] }
        ]
    }
};

async function restoreData() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        console.log('Restoring property_config...');
        await SystemSetting.findOneAndUpdate(
            { key: 'property_config' },
            {
                $set: {
                    value: PROPERTY_CATEGORIES,
                    category: 'property',
                    description: 'Restored property hierarchy (Residential, Commercial, Institutional, Industrial, Agricultural)',
                    isPublic: true
                }
            },
            { upsert: true }
        );
        console.log('✅ property_config restored.');

        console.log('Cleaning up test configs...');
        const deleteResult = await SystemSetting.deleteMany({ key: /^test_config_/ });
        console.log(`✅ Deleted ${deleteResult.deletedCount} test configuration(s).`);

        process.exit(0);
    } catch (error) {
        console.error('Error during restoration:', error);
        process.exit(1);
    }
}

restoreData();
