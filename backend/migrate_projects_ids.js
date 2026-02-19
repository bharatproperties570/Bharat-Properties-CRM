import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lookup from './models/Lookup.js';
import Project from './models/Project.js';

dotenv.config();

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Fetch all lookups to build a map
        const lookups = await Lookup.find({}).lean();
        const lookupMap = {}; // { type: { value: id } }

        lookups.forEach(l => {
            const type = l.lookup_type;
            const val = l.lookup_value;
            if (!lookupMap[type]) lookupMap[type] = {};
            lookupMap[type][val] = l._id;
        });

        const projects = await mongoose.connection.db.collection('projects').find({}).toArray();
        console.log(`Found ${projects.length} projects to migrate`);

        for (const p of projects) {
            console.log(`\nMigrating Project: ${p.name}`);
            const updates = {};

            const processField = (field, type, isArray = false) => {
                const val = p[field];
                if (!val) return;

                if (isArray && Array.isArray(val)) {
                    const newIds = val.map(v => {
                        if (mongoose.Types.ObjectId.isValid(v)) return v;
                        const id = lookupMap[type] && lookupMap[type][v];
                        if (id) return id;
                        console.log(`  !! Missing Lookup for ${type}: ${v}`);
                        return null;
                    }).filter(Boolean);
                    if (newIds.length > 0) updates[field] = newIds;
                } else if (!isArray && !mongoose.Types.ObjectId.isValid(val)) {
                    const id = lookupMap[type] && lookupMap[type][val];
                    if (id) {
                        updates[field] = id;
                    } else {
                        console.log(`  !! Missing Lookup for ${type}: ${val}`);
                    }
                }
            };

            processField('category', 'Category', true);
            processField('subCategory', 'SubCategory', true);
            processField('status', 'ProjectStatus');
            processField('parkingType', 'ParkingType');

            if (Object.keys(updates).length > 0) {
                console.log(`  Updating fields: ${Object.keys(updates).join(', ')}`);
                await mongoose.connection.db.collection('projects').updateOne(
                    { _id: p._id },
                    { $set: updates }
                );
            } else {
                console.log('  No updates needed');
            }
        }

        console.log('\nMigration completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
