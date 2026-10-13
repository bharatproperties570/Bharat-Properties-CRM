import mongoose from 'mongoose';

const BaileysAuthSchema = new mongoose.Schema(
    {
        sessionId: {
            type: String,
            required: true,
            index: true
        },
        fileId: {
            type: String,
            required: true
        },
        data: {
            type: String, // Stringified JSON
            required: true
        }
    },
    {
        timestamps: true,
        collection: 'whatsapp_baileys_auth'
    }
);

BaileysAuthSchema.index({ sessionId: 1, fileId: 1 }, { unique: true });

const BaileysAuth = mongoose.models.BaileysAuth || mongoose.model('BaileysAuth', BaileysAuthSchema);

export default BaileysAuth;
