import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

async function run() {
    try {
        await mongoose.connect(uri);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: String,
            value: mongoose.Schema.Types.Mixed,
            category: String
        }, { collection: 'systemsettings' }));

        const configRecord = await SystemSetting.findOne({ key: 'propertyConfig' });
        if (!configRecord) {
            console.log("No propertyConfig record found.");
            return;
        }

        const config = configRecord.value;
        let changed = false;

        const ensureId = (obj) => {
            if (typeof obj !== 'object' || obj === null) return;
            
            // If it is a sub-category or type, ensure it has an id
            if (obj.name && !obj.id && !obj._id) {
                obj.id = new mongoose.Types.ObjectId().toString();
                changed = true;
            }

            // Recurse
            Object.values(obj).forEach(val => {
                if (Array.isArray(val)) {
                    val.forEach(item => ensureId(item));
                } else if (typeof val === 'object') {
                    ensureId(val);
                }
            });
        };

        // Standardize the tree
        for (const catName in config) {
            const cat = config[catName];
            if (!cat.id && !cat._id) {
                cat.id = new mongoose.Types.ObjectId().toString();
                changed = true;
            }
            if (cat.subCategories) {
                cat.subCategories.forEach(sub => ensureId(sub));
            }
        }

        if (changed) {
            configRecord.markModified('value');
            await configRecord.save();
            console.log("Successfully updated Property Config with missing ObjectIDs.");
        } else {
            console.log("Property Config already consistent with ObjectIDs.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
