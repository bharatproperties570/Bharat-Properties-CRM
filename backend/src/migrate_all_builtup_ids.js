
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGODB_URI;

async function migrateAllBuiltup() {
    try {
        if (!mongoUri) throw new Error('MONGODB_URI not found');
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String,
            parent_lookup_id: mongoose.Schema.Types.ObjectId,
            is_active: { type: Boolean, default: true }
        }, { strict: false }));

        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: String,
            value: mongoose.Schema.Types.Mixed
        }, { strict: false }));

        const configSetting = await SystemSetting.findOne({ key: 'propertyConfig' });
        if (!configSetting || !configSetting.value) {
            console.error('propertyConfig not found.');
            await mongoose.disconnect();
            return;
        }

        const config = configSetting.value;
        let totalCreated = 0;
        let totalStandardized = 0;

        for (const [catName, catData] of Object.entries(config)) {
            if (!catData.subCategories) continue;
            
            // 1. Ensure Category Lookup
            let catLookup = await Lookup.findOne({ lookup_type: 'Category', lookup_value: catName });
            if (!catLookup) {
                console.log(`Creating Category: ${catName}`);
                catLookup = await Lookup.create({ lookup_type: 'Category', lookup_value: catName });
            }

            for (const subCat of catData.subCategories) {
                // 2. Ensure SubCategory Lookup
                let subCatLookup = await Lookup.findOne({ 
                    lookup_type: 'SubCategory', 
                    lookup_value: subCat.name, 
                    parent_lookup_id: catLookup._id 
                });
                if (!subCatLookup) {
                    console.log(`Creating SubCategory: ${subCat.name} (Parent: ${catName})`);
                    subCatLookup = await Lookup.create({ 
                        lookup_type: 'SubCategory', 
                        lookup_value: subCat.name, 
                        parent_lookup_id: catLookup._id 
                    });
                }

                if (!subCat.types) continue;
                for (const propType of subCat.types) {
                    // 3. Ensure PropertyType Lookup
                    let propTypeLookup = await Lookup.findOne({ 
                        lookup_type: 'PropertyType', 
                        lookup_value: propType.name, 
                        parent_lookup_id: subCatLookup._id 
                    });
                    if (!propTypeLookup) {
                        console.log(`Creating PropertyType: ${propType.name} (Parent: ${subCat.name})`);
                        propTypeLookup = await Lookup.create({ 
                            lookup_type: 'PropertyType', 
                            lookup_value: propType.name, 
                            parent_lookup_id: subCatLookup._id 
                        });
                    }

                    if (!propType.builtupTypes) continue;
                    
                    const newBuiltupTypes = [];
                    for (let bType of propType.builtupTypes) {
                        const originalName = typeof bType === 'object' ? bType.name : bType;
                        if (!originalName) continue;

                        // Standardize naming to "Built-up" (hyphen)
                        let targetName = originalName.trim();
                        if (targetName.toLowerCase() === 'built up' || targetName.toLowerCase() === 'builtup') {
                           targetName = 'Built-up';
                        }
                        // Handle cases like "25% Built Up" -> "25% Built-up"
                        targetName = targetName.replace(/built\s+up/gi, 'Built-up').replace(/builtup/gi, 'Built-up');

                        // 4. Ensure BuiltupType Lookup
                        let bLookup = await Lookup.findOne({
                            lookup_type: 'BuiltupType',
                            parent_lookup_id: propTypeLookup._id,
                            $or: [
                                { lookup_value: targetName },
                                { lookup_value: originalName },
                                { lookup_value: new RegExp(`^${targetName}$`, 'i') },
                                { lookup_value: new RegExp(`^${originalName}$`, 'i') }
                            ]
                        });

                        if (!bLookup) {
                            console.log(`Creating BuiltupType: ${targetName} (Parent: ${propType.name} in ${subCat.name})`);
                            bLookup = await Lookup.create({
                                lookup_type: 'BuiltupType',
                                lookup_value: targetName,
                                parent_lookup_id: propTypeLookup._id,
                                is_active: true
                            });
                            totalCreated++;
                        } else if (bLookup.lookup_value !== targetName) {
                            console.log(`Standardizing BuiltupType: ${bLookup.lookup_value} -> ${targetName}`);
                            bLookup.lookup_value = targetName;
                            await bLookup.save();
                            totalStandardized++;
                        }

                        newBuiltupTypes.push({ _id: bLookup._id, name: bLookup.lookup_value });
                    }
                    propType.builtupTypes = newBuiltupTypes;
                }
            }
        }

        configSetting.markModified('value');
        await configSetting.save();
        console.log(`\n--- MIGRATION SUMMARY ---`);
        console.log(`Created: ${totalCreated}`);
        console.log(`Standardized: ${totalStandardized}`);
        console.log(`propertyConfig successfully migrated globally.`);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Global Migration Failed:', err);
    }
}

migrateAllBuiltup();
