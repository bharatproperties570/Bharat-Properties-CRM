import mongoose from 'mongoose';

/**
 * ============================================================
 *  AUTO VERIFICATION SETTINGS MODEL
 *  Enterprise Meta Policy-Compliant Anti-Ban Configuration
 * ============================================================
 */
const autoVerificationSettingsSchema = new mongoose.Schema({
    // Master on/off switch
    isEnabled: {
        type: Boolean,
        default: true,
        description: 'Global master toggle for autonomous group deal verification'
    },

    // Tier 1: Quality Gatekeeper
    confidenceThreshold: {
        type: Number,
        default: 80,
        min: 50,
        max: 100,
        description: 'Minimum AI intake confidence score required to auto-dispatch (default: 80%)'
    },
    requireSaleIntentOnly: {
        type: Boolean,
        default: true,
        description: 'Only dispatch to seller listings (strictly exclude buyer demand posts)'
    },

    // Tier 2: Recipient Frequency & Cooldown
    cooldownHoursPerBroker: {
        type: Number,
        default: 48,
        min: 12,
        max: 168,
        description: 'Hours to wait before sending another inquiry to the same broker (default: 48 hours)'
    },
    excludedPhones: [{
        type: String,
        trim: true,
        description: 'Blacklisted numbers (internal staff, company numbers, opt-outs)'
    }],

    // Tier 3: Daily Quota & Business Hours
    dailyLimit: {
        type: Number,
        default: 35,
        min: 5,
        max: 100,
        description: 'Maximum automatic outbound inquiries allowed per 24 hours (anti-spike ceiling)'
    },
    dailySentCount: {
        type: Number,
        default: 0,
        description: 'Counter of outbound inquiries dispatched today'
    },
    lastResetDate: {
        type: String,
        default: () => new Date().toISOString().split('T')[0],
        description: 'YYYY-MM-DD tracking when dailySentCount was last reset'
    },
    businessHoursStart: {
        type: String,
        default: '10:00',
        description: 'Earliest time (IST) to send automatic messages (e.g. 10:00 AM)'
    },
    businessHoursEnd: {
        type: String,
        default: '19:00',
        description: 'Latest time (IST) to send automatic messages (e.g. 07:00 PM)'
    },
    activeDays: {
        type: [Number],
        default: [1, 2, 3, 4, 5, 6], // 1=Mon, 6=Sat (Sunday 0 excluded)
        description: 'Days of week allowed for automatic dispatch'
    },

    // Tier 4: Natural Gaussian Pacing
    minDelaySeconds: {
        type: Number,
        default: 90,
        min: 30,
        description: 'Minimum random delay between messages (seconds)'
    },
    maxDelaySeconds: {
        type: Number,
        default: 210,
        min: 60,
        description: 'Maximum random delay between messages (seconds)'
    },

    // Tier 5: Human Telemetry Simulation
    simulateTypingSeconds: {
        type: Number,
        default: 5,
        min: 2,
        max: 10,
        description: 'Seconds to send WhatsApp composing presence before transmitting'
    },

    // Tier 7: Soft Opt-Out Courtesy Note
    includeOptOutCourtesy: {
        type: Boolean,
        default: true,
        description: 'Append polite non-intrusive ignore note to eliminate spam report incentives'
    },
    optOutCourtesyText: {
        type: String,
        default: '\n\n(Agar deal already close ho chuki ho ya number galat ho to kripya ignore karein, shukriya ji.)',
        description: 'Polite courtesy footer to drop user block/report rates'
    },

    // Health & Safety Circuit Breaker
    circuitBreakerTripped: {
        type: Boolean,
        default: false,
        description: 'True if automatically paused due to socket errors, 403s, or high failure rates'
    },
    circuitBreakerReason: {
        type: String,
        default: null
    },
    circuitBreakerTrippedAt: {
        type: Date,
        default: null
    },

    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Singleton accessor
autoVerificationSettingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }

    // Daily counter auto-reset check
    const todayStr = new Date().toISOString().split('T')[0];
    if (settings.lastResetDate !== todayStr) {
        settings.dailySentCount = 0;
        settings.lastResetDate = todayStr;
        await settings.save();
    }

    return settings;
};

export default mongoose.model('AutoVerificationSettings', autoVerificationSettingsSchema);
