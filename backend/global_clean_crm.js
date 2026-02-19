import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function globalClean() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const collections = [
            {
                name: 'leads',
                refFields: ['owner', 'assign', 'team', 'source', 'industry', 'city', 'requirement', 'budget', 'location', 'professionCategory', 'professionSubCategory', 'designation']
            },
            {
                name: 'deals',
                refFields: ['owner', 'assign', 'team', 'lead', 'contact', 'project', 'unit', 'propertyType', 'intent', 'status', 'category', 'subCategory']
            },
            {
                name: 'inventories',
                refFields: ['project', 'block', 'category', 'subCategory', 'unitType', 'status', 'facing', 'owner', 'assign', 'team']
            }
        ];

        for (const collConfig of collections) {
            const docs = await mongoose.connection.db.collection(collConfig.name).find({}).toArray();
            console.log(`\nCleaning collection: ${collConfig.name} (${docs.length} docs)`);

            for (const doc of docs) {
                const updates = {};
                const unsets = {};

                collConfig.refFields.forEach(field => {
                    const val = doc[field];

                    if (Array.isArray(val)) {
                        const cleanedArr = val.filter(v => {
                            if (v === "" || v === null || v === undefined) return false;
                            if (mongoose.Types.ObjectId.isValid(v)) return true;
                            return false;
                        });

                        if (cleanedArr.length !== val.length) {
                            if (cleanedArr.length === 0) {
                                unsets[field] = "";
                            } else {
                                updates[field] = cleanedArr.map(v => new mongoose.Types.ObjectId(v));
                            }
                        } else if (val.length > 0) {
                            updates[field] = val.map(v => mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v);
                        }
                    } else {
                        if (val === "" || val === null || val === undefined) {
                            if (doc.hasOwnProperty(field)) unsets[field] = "";
                        } else if (!mongoose.Types.ObjectId.isValid(val)) {
                            // Only unset if it was supposed to be a ref but is for sure not an ID
                            unsets[field] = "";
                        } else {
                            updates[field] = new mongoose.Types.ObjectId(val);
                        }
                    }
                });

                const updateQuery = {};
                if (Object.keys(updates).length > 0) updateQuery.$set = updates;
                if (Object.keys(unsets).length > 0) updateQuery.$unset = unsets;

                if (Object.keys(updateQuery).length > 0) {
                    await mongoose.connection.db.collection(collConfig.name).updateOne(
                        { _id: doc._id },
                        updateQuery
                    );
                }
            }
            console.log(`  Finished cleaning ${collConfig.name}`);
        }

        console.log('\nGlobal cleaning completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Global cleaning failed:', err);
        process.exit(1);
    }
}

globalClean();
