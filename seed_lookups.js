import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('Connected to DB');
        
        const LookupSchema = new mongoose.Schema({
            lookup_type: { type: String, required: true },
            lookup_value: { type: String, required: true },
            isActive: { type: Boolean, default: true }
        }, { timestamps: true });
        
        const Lookup = mongoose.models.Lookup || mongoose.model("Lookup", LookupSchema);

        const lookupsToSeed = [
            { type: 'WaterSource', values: ['Canal', 'Tube Well', 'Rain-fed', 'River', 'Borewell'] },
            { type: 'WaterLevel', values: ['Less than 50ft', '50ft - 100ft', '100ft - 200ft', 'Below 200ft'] },
            { type: 'WaterPumpType', values: ['Electric Motor', 'Diesel Generator', 'Submersible', 'Solar Pump'] },
            { type: 'FrontOnRoad', values: ['Less than 20 ft', '20 ft - 40 ft', '40 ft - 80 ft', 'Above 80 ft', 'Highway Attached'] },
            { type: 'NumberOfOwner', values: ['1', '2', '3', '4', '5+'] }
        ];

        for (const cat of lookupsToSeed) {
            for (const val of cat.values) {
                const exists = await Lookup.findOne({ lookup_type: cat.type, lookup_value: val });
                if (!exists) {
                    await Lookup.create({ lookup_type: cat.type, lookup_value: val, isActive: true });
                    console.log(`Created ${cat.type}: ${val}`);
                }
            }
        }
        
        console.log('Seeding complete.');
        mongoose.disconnect();
    })
    .catch(console.error);
