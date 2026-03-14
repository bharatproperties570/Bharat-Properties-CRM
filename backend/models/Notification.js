import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true }, // 'assignment', 'task', 'mention', 'stage_change', 'system'
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String }, // Optional link to the entity (e.g., /leads/123)
    isRead: { type: Boolean, default: false, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("Notification", NotificationSchema);
