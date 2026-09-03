import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const SystemSetting = mongoose.connection.db.collection('systemsettings');
    const waTemplates = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' });
    let fixed = false;
    for (let t of waTemplates.value) {
        if (t.name === 'Deal Property Match') {
            t.name = 'property_match_default'; // Change to actual Meta template
            fixed = true;
        }
    }
    
    if (fixed) {
        await SystemSetting.updateOne({ key: 'crm_whatsapp_templates' }, { $set: { value: waTemplates.value } });
        console.log('Fixed Deal Property Match template name mapping to property_match_default.');
    } else {
        console.log('Not found');
    }
    process.exit(0);
}
run();
