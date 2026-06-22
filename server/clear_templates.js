import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const Schema = mongoose.Schema;
const systemSettingSchema = new Schema({
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting', systemSettingSchema);

async function clear() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const res = await SystemSetting.deleteMany({ key: { $in: ['crm_whatsapp_templates', 'crm_sms_templates', 'crm_rcs_templates'] } });
        console.log("Deleted count:", res.deletedCount);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}
clear();
