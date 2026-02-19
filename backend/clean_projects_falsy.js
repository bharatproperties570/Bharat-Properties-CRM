import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lookup from './models/Lookup.js';
import Project from './models/Project.js';

dotenv.config();

async function clean() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const fieldsToCheck = ['category', 'subCategory', 'status', 'parkingType', 'unitType'];

        const projects = await mongoose.connection.db.collection('projects').find({}).toArray();
        console.log(`Found ${projects.length} projects to clean`);

        for (const p of projects) {
            console.log(`\nCleaning Project: ${p.name}`);
            const updates = {};
            const unsets = {};

            fieldsToCheck.forEach(field => {
                const val = p[field];
                if (val === "" || val === null) {
                    unsets[field] = "";
                } else if (Array.isArray(val)) {
                    const cleanedArr = val.filter(v => v !== "" && v !== null);
                    if (cleanedArr.length !== val.length) {
                        updates[field] = cleanedArr;
                    }
                }
            });

            const updateQuery = {};
            if (Object.keys(updates).length > 0) updateQuery.$set = updates;
            if (Object.keys(unsets).length > 0) updateQuery.$unset = unsets;

            if (Object.keys(updateQuery).length > 0) {
                console.log(`  Updating fields: ${Object.keys(updates).concat(Object.keys(unsets)).join(', ')}`);
                await mongoose.connection.db.collection('projects').updateOne(
                    { _id: p._id },
                    updateQuery
                );
            } else {
                console.log('  No cleaning needed');
            }
        }

        console.log('\nCleaning completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Cleaning failed:', err);
        process.exit(1);
    }
}

clean();
