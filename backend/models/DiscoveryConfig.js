import mongoose from 'mongoose';

export const SUPPORTED_AREA_UNITS = ['sqft', 'sqyd', 'marla', 'kanal', 'bigha', 'acre'];
export const SUPPORTED_SELLER_TYPES = ['owner', 'broker', 'builder'];

const discoveryConfigSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    keywords: [{ type: String, required: true, trim: true }],
    location_filters: [{ type: String, trim: true }],
    property_types: [{ type: String, trim: true }],
    schedule_cron: { type: String, default: '0 0 * * *' }, // Daily at midnight
    is_active: { type: Boolean, default: true },
    last_run_at: { type: Date },
    last_run_status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
    urls_discovered_count: { type: Number, default: 0 },

    // Phase 1 Enhanced Filters (Backward Compatible / Optional)
    price_min: { type: Number, min: 0, default: null },
    price_max: { type: Number, min: 0, default: null },
    size_min: { type: Number, min: 0, default: null },
    size_max: { type: Number, min: 0, default: null },
    size_unit: { 
        type: String, 
        enum: [...SUPPORTED_AREA_UNITS, null], 
        default: null 
    },
    seller_types: [{ 
        type: String, 
        enum: SUPPORTED_SELLER_TYPES 
    }],
    portal_whitelist: [{ 
        type: String, 
        trim: true, 
        lowercase: true 
    }],
    freshness_days: { 
        type: Number, 
        min: 1, 
        max: 365, 
        default: null 
    }
}, {
    timestamps: true
});

const DiscoveryConfig = mongoose.model('DiscoveryConfig', discoveryConfigSchema);

export default DiscoveryConfig;
