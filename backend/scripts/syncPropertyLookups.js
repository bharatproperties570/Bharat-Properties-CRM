import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lookup from '../models/Lookup.js';
import SystemSetting from '../models/SystemSetting.js';

dotenv.config();

async function sync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const configSetting = await SystemSetting.findOne({ key: 'property_config' });
        if (!configSetting) {
            console.error('Property configuration not found in system settings');
            process.exit(1);
        }

        const config = configSetting.value;
        const categories = Object.keys(config);

        for (const catName of categories) {
            console.log(`Syncing Category: ${catName}`);

            // 1. Sync Category
            let category = await Lookup.findOneAndUpdate(
                { lookup_type: 'Category', lookup_value: catName },
                { lookup_type: 'Category', lookup_value: catName, isActive: true },
                { upsert: true, new: true }
            );

            const subCats = config[catName].subCategories || [];
            for (const subCatData of subCats) {
                const subCatName = subCatData.name;
                console.log(`  Syncing SubCategory: ${subCatName}`);

                // 2. Sync SubCategory
                let subCategory = await Lookup.findOneAndUpdate(
                    { lookup_type: 'SubCategory', lookup_value: subCatName, parent_lookup_id: category._id },
                    {
                        lookup_type: 'SubCategory',
                        lookup_value: subCatName,
                        parent_lookup_id: category._id,
                        parent_lookup_value: category.lookup_value,
                        isActive: true
                    },
                    { upsert: true, new: true }
                );

                const types = subCatData.types || [];
                for (const typeData of types) {
                    const typeName = typeData.name;
                    console.log(`    Syncing PropertyType (Size Type): ${typeName}`);

                    // 3. Sync PropertyType
                    let propertyType = await Lookup.findOneAndUpdate(
                        { lookup_type: 'PropertyType', lookup_value: typeName, parent_lookup_id: subCategory._id },
                        {
                            lookup_type: 'PropertyType',
                            lookup_value: typeName,
                            parent_lookup_id: subCategory._id,
                            parent_lookup_value: subCategory.lookup_value,
                            isActive: true
                        },
                        { upsert: true, new: true }
                    );

                    const builtups = typeData.builtupTypes || [];
                    for (const buName of builtups) {
                        console.log(`      Syncing BuiltupType: ${buName}`);
                        // 4. Sync BuiltupType
                        await Lookup.findOneAndUpdate(
                            { lookup_type: 'BuiltupType', lookup_value: buName, parent_lookup_id: propertyType._id },
                            {
                                lookup_type: 'BuiltupType',
                                lookup_value: buName,
                                parent_lookup_id: propertyType._id,
                                parent_lookup_value: propertyType.lookup_value,
                                isActive: true
                            },
                            { upsert: true, new: true }
                        );
                    }
                }
            }
        }

        console.log('Synchronization completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Synchronization failed:', err);
        process.exit(1);
    }
}

sync();
