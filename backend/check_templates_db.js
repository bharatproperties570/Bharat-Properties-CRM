import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const SystemSettingSchema = new mongoose.Schema({
    key: String,
    category: String,
    value: mongoose.Schema.Types.Mixed,
    isPublic: Boolean
}, { collection: 'settings', timestamps: true });

const SystemSetting = mongoose.model('SystemSetting', SystemSettingSchema);

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const db = mongoose.connection.db;
        for (const colName of ['systemsettings', 'system_settings', 'settings']) {
            const docs = await db.collection(colName).find({}).toArray();
            console.log(`Collection: ${colName}, Count: ${docs.length}`);
            for (const doc of docs) {
                if (doc.key && (doc.key.includes('whatsapp') || doc.key.includes('template'))) {
                    console.log(`  Key: ${doc.key}, Type of value: ${typeof doc.value}`);
                    if (doc.key === 'crm_whatsapp_templates' || doc.key === 'whatsapp_templates') {
                        console.log(`  Value:`, JSON.stringify(doc.value, null, 2));
                    }
                }
            }
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
