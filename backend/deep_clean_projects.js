import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function deepClean() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const projects = await mongoose.connection.db.collection('projects').find({}).toArray();
        console.log(`Found ${projects.length} projects to deep clean`);

        const refFields = [
            'developerId', 'category', 'subCategory', 'status',
            'parkingType', 'unitType', 'owner', 'assign', 'team'
        ];

        for (const p of projects) {
            console.log(`\nChecking Project: ${p.name} (${p._id})`);
            const updates = {};
            const unsets = {};

            refFields.forEach(field => {
                const val = p[field];

                if (Array.isArray(val)) {
                    const cleanedArr = val.filter(v => {
                        if (v === "" || v === null || v === undefined) return false;
                        if (mongoose.Types.ObjectId.isValid(v)) return true;
                        return false; // Remove invalid/malformed strings
                    });

                    if (cleanedArr.length !== val.length) {
                        if (cleanedArr.length === 0) {
                            unsets[field] = "";
                        } else {
                            updates[field] = cleanedArr.map(v => new mongoose.Types.ObjectId(v));
                        }
                    } else if (val.length > 0) {
                        // Ensure they are actually ObjectIds if they are valid strings
                        const objectIdArr = val.map(v => mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v);
                        // Only update if it actually changed (e.g. from string to ObjectId)
                        // But since we are using native collection, let's just be sure
                        updates[field] = objectIdArr;
                    }
                } else {
                    if (val === "" || val === null || val === undefined) {
                        if (p.hasOwnProperty(field)) unsets[field] = "";
                    } else if (!mongoose.Types.ObjectId.isValid(val)) {
                        console.log(`  !! INVALID ID for ${field}: ${val}`);
                        unsets[field] = "";
                    } else {
                        // Ensure it's stored as an ObjectId
                        updates[field] = new mongoose.Types.ObjectId(val);
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
                console.log('  All fields clean');
            }
        }

        console.log('\nDeep cleaning completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Deep cleaning failed:', err);
        process.exit(1);
    }
}

deepClean();
