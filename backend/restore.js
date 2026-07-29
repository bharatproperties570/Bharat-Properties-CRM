const mongoose = require('mongoose');
require('./backend/src/config/env.js'); // Ensure env vars are loaded

async function restore() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting', new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed }, { strict: false }));
        
        const result = await SystemSetting.deleteOne({ key: 'crm_whatsapp_templates' });
        console.log('Deleted crm_whatsapp_templates from DB:', result.deletedCount);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
restore();
