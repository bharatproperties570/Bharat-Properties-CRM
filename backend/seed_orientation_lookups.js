import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const defaults = {
    Facing: [
        'Park Facing', 'Main Road Facing', 'Corner', 'School Facing',
        'Temple/Mandir Facing', 'Commercial Facing', 'Club Facing',
        'Pool Facing', 'Garden Facing', 'North Facing', 'South Facing',
        'East Facing', 'West Facing'
    ],
    Direction: [
        'North', 'South', 'East', 'West',
        'North-East', 'North-West', 'South-East', 'South-West'
    ],
    RoadWidth: [
        '9 Mtr (30 Feet) Wide', '12 Mtr (40 Feet) Wide', '18 Mtr (60 Feet) Wide',
        '24 Mtr (80 Feet) Wide', '30 Mtr (100 Feet) Wide', '60 Mtr (200 Feet) Wide'
    ],
    UnitType: [
        'Ordinary', 'Corner', 'Two Side Open', 'Three Side Open'
    ]
};

async function seedLookups() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        for (const [type, values] of Object.entries(defaults)) {
            console.log(`Checking ${type}...`);
            for (const val of values) {
                const existing = await Lookup.findOne({ lookup_type: type, lookup_value: val });
                if (!existing) {
                    await Lookup.create({
                        lookup_type: type,
                        lookup_value: val,
                        isActive: true
                    });
                    console.log(`  Added: ${val}`);
                } else {
                    console.log(`  Exists: ${val}`);
                }
            }
        }

        console.log('Seeding complete.');
        await mongoose.disconnect();
    } catch (error) {
        console.error('Seeding Error:', error);
    }
}

seedLookups();
