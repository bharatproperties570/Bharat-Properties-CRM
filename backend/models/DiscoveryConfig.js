import mongoose from 'mongoose';

const discoveryConfigSchema = new mongoose.Schema({
    name: { type: String, required: true },
    keywords: [{ type: String, required: true }],
    location_filters: [{ type: String }],
    property_types: [{ type: String }],
    schedule_cron: { type: String, default: '0 0 * * *' }, // Daily at midnight
    is_active: { type: Boolean, default: true },
    last_run_at: { type: Date },
    last_run_status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
    urls_discovered_count: { type: Number, default: 0 }
}, {
    timestamps: true
});

const DiscoveryConfig = mongoose.model('DiscoveryConfig', discoveryConfigSchema);

export default DiscoveryConfig;
