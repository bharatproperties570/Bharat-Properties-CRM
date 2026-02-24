
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function inspectTypeData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));
        const config = await SystemSetting.findOne({ key: 'property_config' });

        const cat = config.value["Residential"];
        const subCat = cat.subCategories.find(s => s.name === "Flat/Apartment");
        console.log('SubCategory "Flat/Apartment" Types:');
        console.log(JSON.stringify(subCat.types, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

inspectTypeData();
