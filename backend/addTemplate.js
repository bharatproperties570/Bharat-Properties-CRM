import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bharat_properties';

async function run() {
    await mongoose.connect(MONGO_URI);
    
    const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
        key: { type: String, unique: true },
        value: mongoose.Schema.Types.Mixed
    }, { strict: false }));

    const existing = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' });
    let templates = existing ? existing.value : [];
    if (!Array.isArray(templates)) templates = [];

    // Remove existing match template if it exists
    templates = templates.filter(t => t.name !== 'lead_match_full_v1');

    // Add new perfect template
    templates.push({
        id: 'tmpl_match_full_001',
        name: 'lead_match_full_v1',
        language: 'en',
        status: 'APPROVED',
        category: 'MARKETING',
        systemContext: ['lead_match_full', 'lead_match_short'], // Map it to the deal matching UI
        components: [
            {
                type: 'HEADER',
                format: 'TEXT',
                text: '🌟 Premium Property Match'
            },
            {
                type: 'BODY',
                text: 'Hi {{1}} 👋\n\nBased on your specific requirement, our AI Match Center has identified a highly suitable property for you:\n\n{{2}}\n\nAre you interested in scheduling a site visit or receiving more details?'
            },
            {
                type: 'FOOTER',
                text: 'Bharat Properties • Enterprise CRM'
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: '✅ Yes, send details' },
                    { type: 'QUICK_REPLY', text: '📅 Schedule Visit' }
                ]
            }
        ]
    });

    if (existing) {
        existing.value = templates;
        await existing.save();
    } else {
        await SystemSetting.create({ key: 'crm_whatsapp_templates', value: templates });
    }

    console.log('✅ Template added and mapped successfully!');
    process.exit(0);
}

run().catch(console.error);
