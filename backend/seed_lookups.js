import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lookup from './models/Lookup.js';

dotenv.config();

const data = [
    { type: 'Category', values: ['Residential', 'Commercial', 'Institutional', 'Industrial', 'Agricultural'] },
    { type: 'SubCategory', values: ['Plot', 'Independent House', 'Flat/Apartment', 'Builder Floor', 'Shop', 'Showroom', 'Office Space', 'Retail Store', 'SOHO', 'Executive Room', 'Multiplex', 'Virtual Space', 'School', 'Hotel', 'Universities', 'Hospital', 'College', 'Warehouse', 'Cold Storage', 'Rice Seller', 'Building', 'Factory', 'Land', 'Farm House'] },
    { type: 'ProjectStatus', values: ['Under Construction', 'Ready to Move', 'New Launch', 'Pre-Launch', 'Upcoming'] },
    { type: 'ParkingType', values: ['Covered', 'Open', 'Stilt', 'Basement', 'Podium', 'Open Parking'] },
    { type: 'UnitType', values: ['Ordinary', 'Corner', 'Two Side Open', 'Three Side Open'] }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        for (const item of data) {
            console.log(`Seeding ${item.type}...`);
            for (const val of item.values) {
                const query = { lookup_type: item.type, lookup_value: val };
                const existing = await Lookup.findOne(query);
                if (!existing) {
                    await Lookup.create({ ...query, isActive: true, order: 0 });
                    console.log(`  + Created: ${val}`);
                } else {
                    console.log(`  . Exists: ${val}`);
                }
            }
        }

        console.log('Seeding completed');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seed();
