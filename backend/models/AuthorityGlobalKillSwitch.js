import mongoose from 'mongoose';

/**
 * AuthorityGlobalKillSwitch
 *
 * Durable cross-instance global kill switch for authority sources.
 * When an authority source kill switch is engaged, all instances must refuse outbound egress.
 */
const AuthorityGlobalKillSwitchSchema = new mongoose.Schema({
    authorityCode: {
        type: String,
        required: true,
        enum: ['HSVP', 'CHD', 'GMADA'],
        unique: true,
        index: true
    },
    isKilled: {
        type: Boolean,
        required: true,
        default: false
    },
    reason: {
        type: String,
        default: ''
    },
    killedAt: {
        type: Date,
        default: null
    },
    killedBy: {
        type: String,
        default: 'system'
    }
}, {
    timestamps: true,
    collection: 'authority_global_kill_switches'
});

export const AuthorityGlobalKillSwitch = mongoose.model('AuthorityGlobalKillSwitch', AuthorityGlobalKillSwitchSchema);
export default AuthorityGlobalKillSwitch;
