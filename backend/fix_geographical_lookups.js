import "dotenv/config";
import mongoose from 'mongoose';
import connectDB from "./config/db.js";
import Lookup from './models/Lookup.js';

// Dictionary of correct city to state mappings
const CORRECT_MAPPINGS = {
    // Correcting wrongly mapped cities
    'kapurthala': 'Punjab',
    'chandigarh': 'Chandigarh',
    'new delhi': 'Delhi',
    'delhi': 'Delhi',
    'saharanpur': 'Uttar Pradesh',
    'ropar': 'Punjab',
    'patiala': 'Punjab',
    'mohali': 'Punjab',
    'durgapur': 'West Bengal',
    'solan': 'Himachal Pradesh',
    'deoria': 'Uttar Pradesh',
    'khekra': 'Uttar Pradesh',
    'mathura': 'Uttar Pradesh',
    'noida': 'Uttar Pradesh',
    'rishikesh': 'Uttarakhand',

    // Mapping cities/villages that currently have "No State"
    'lahli': 'Haryana',
    'sanghour': 'Haryana',
    'majra roran': 'Haryana',
    'hassanpur': 'Haryana',
    'pundri': 'Haryana',
    'umri': 'Haryana',
    'dudhla': 'Haryana',
    'pipli': 'Haryana',
    'bargat thalipur': 'Haryana',
    'gharaunda': 'Haryana',
    'bhore saidan': 'Haryana',
    'jyotisar': 'Haryana',
    'bapoli': 'Haryana'
};

async function fixLookups() {
    console.log("Connecting to Database...");
    await connectDB();
    console.log("MongoDB Connected.");

    // 1. Get/Create Country "India"
    let country = await Lookup.findOne({ lookup_type: 'Country', lookup_value: { $regex: /^india$/i } });
    if (!country) {
        country = await Lookup.create({ lookup_type: 'Country', lookup_value: 'India' });
        console.log(`[GEOGRAPHY] Created Country "India" lookup.`);
    }

    // Helper to find or create a State lookup
    const getStateLookupId = async (stateName) => {
        const trimmed = stateName.trim();
        let state = await Lookup.findOne({
            lookup_type: 'State',
            lookup_value: { $regex: new RegExp(`^${trimmed}$`, 'i') }
        });
        if (!state) {
            state = await Lookup.create({
                lookup_type: 'State',
                lookup_value: trimmed,
                parent_lookup_id: country._id,
                parent_lookup_value: 'India'
            });
            console.log(`[GEOGRAPHY] Created new State lookup: "${trimmed}"`);
        }
        return state;
    };

    // 2. Fetch all cities in database
    const cities = await Lookup.find({ lookup_type: 'City' }).populate('parent_lookup_id');
    console.log(`Auditing ${cities.length} cities...`);

    let fixedCount = 0;

    for (const city of cities) {
        const cityNameLower = city.lookup_value.trim().toLowerCase();
        const correctStateName = CORRECT_MAPPINGS[cityNameLower];

        if (correctStateName) {
            const currentStateName = city.parent_lookup_id ? city.parent_lookup_id.lookup_value : 'None';

            if (currentStateName.toLowerCase() !== correctStateName.toLowerCase()) {
                console.log(`[MISMATCH FOUND] City: "${city.lookup_value}" is mapped to State: "${currentStateName}". Should be: "${correctStateName}"`);
                
                try {
                    const targetState = await getStateLookupId(correctStateName);
                    
                    // Update city's parent state linkage
                    city.parent_lookup_id = targetState._id;
                    city.parent_lookup_value = targetState.lookup_value;
                    await city.save();

                    console.log(`  ✅ Successfully updated "${city.lookup_value}" parent state to: "${targetState.lookup_value}"`);
                    fixedCount++;
                } catch (err) {
                    console.error(`  ❌ Error updating "${city.lookup_value}":`, err.message);
                }
                console.log("-".repeat(50));
            }
        }
    }

    console.log(`\nGeographical Lookup Repair Completed.`);
    console.log(`Total Mapped Cities Repaired: ${fixedCount}`);

    mongoose.connection.close();
    console.log("Database Connection Closed.");
}

fixLookups().catch(err => {
    console.error("Critical failure during geographical repair:", err);
    process.exit(1);
});
