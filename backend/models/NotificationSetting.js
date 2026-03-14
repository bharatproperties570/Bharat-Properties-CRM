import mongoose from 'mongoose';

const NotificationSettingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    // Flexible structure to store channel preferences for various event types
    // Example: { 'assignment': { 'web': true, 'email': false }, 'reminders': { 'web': true, 'email': true } }
    presets: {
        type: Map,
        of: Map,
        default: {}
    },
    personalizedRules: [{
        entity: String, // lead, contact, deal
        filter: String,
        value: String,
        triggers: [String],
        channels: [String] // web, email, whatsapp, text, mobile
    }],
    webPermissions: {
        incomingCalls: { type: Boolean, default: true },
        incomingTexts: { type: Boolean, default: true }
    }
}, { timestamps: true });

export default mongoose.model('NotificationSetting', NotificationSettingSchema);
