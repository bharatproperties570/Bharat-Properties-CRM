import mongoose from 'mongoose';

const integrationSettingsSchema = new mongoose.Schema({
    openaiKey: {
        type: String,
        default: ''
    },
    elevenLabsKey: {
        type: String,
        default: ''
    },
    whatsappToken: {
        type: String,
        default: ''
    },
    whatsappPhoneNumberId: {
        type: String,
        default: ''
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// We only need one settings document per system
integrationSettingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

export default mongoose.model('IntegrationSettings', integrationSettingsSchema);
