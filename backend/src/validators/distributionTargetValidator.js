import mongoose from 'mongoose';
import User from '../../models/User.js';
import Team from '../../models/Team.js';

export class DistributionError extends Error {
    constructor(code, message, details = []) {
        super(message);
        this.code = code;
        this.details = details;
    }
}

const validateTarget = async (target, label) => {
    if (!['user', 'team'].includes(target.type)) {
        throw new DistributionError('DISTRIBUTION_TARGET_TYPE_INVALID', `${label} target type must be 'user' or 'team'.`);
    }

    if (!target.ids || !Array.isArray(target.ids) || target.ids.length === 0) {
        throw new DistributionError('DISTRIBUTION_TARGET_ID_INVALID', `${label} target ids array cannot be empty.`);
    }

    const uniqueIds = new Set(target.ids.map(id => id.toString()));
    if (uniqueIds.size !== target.ids.length) {
        throw new DistributionError('DISTRIBUTION_TARGET_DUPLICATE', `${label} target ids contain duplicates.`);
    }

    for (const id of target.ids) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new DistributionError('DISTRIBUTION_TARGET_ID_INVALID', `Invalid ObjectId in ${label.toLowerCase()} target: ${id}`);
        }
    }

    if (target.type === 'user') {
        const users = await User.find({ _id: { $in: target.ids } }).lean();
        
        if (users.length !== target.ids.length) {
            const foundIds = users.map(u => u._id.toString());
            const missing = target.ids.filter(id => !foundIds.includes(id.toString()));
            throw new DistributionError('DISTRIBUTION_TARGET_NOT_FOUND', `User(s) not found in DB: ${missing.join(', ')}`);
        }

        for (const user of users) {
            if (user.isDeleted === true) {
                throw new DistributionError('DISTRIBUTION_TARGET_INACTIVE', `User is deleted: ${user._id}`);
            }
            if (user.isActive === false || user.status === 'inactive' || user.status === 'suspended') {
                throw new DistributionError('DISTRIBUTION_TARGET_INACTIVE', `User is inactive/suspended: ${user._id}`);
            }
        }
    } else if (target.type === 'team') {
        const teams = await Team.find({ _id: { $in: target.ids } }).lean();
        
        if (teams.length !== target.ids.length) {
            const foundIds = teams.map(t => t._id.toString());
            const missing = target.ids.filter(id => !foundIds.includes(id.toString()));
            throw new DistributionError('DISTRIBUTION_TARGET_NOT_FOUND', `Team(s) not found in DB: ${missing.join(', ')}`);
        }

        for (const team of teams) {
            if (team.isDeleted === true) {
                throw new DistributionError('DISTRIBUTION_TARGET_INACTIVE', `Team is deleted: ${team._id}`);
            }
            if (team.isActive === false) {
                throw new DistributionError('DISTRIBUTION_TARGET_INACTIVE', `Team is inactive: ${team._id}`);
            }
        }
    }
};

/**
 * Validates the primary assignmentTarget and fallbackTarget.
 * Uses a conservative design: targets are strictly validated regardless of 
 * whether the rule is enabled or disabled. This prevents saving broken states 
 * entirely and avoids unexpected failures upon activation.
 */
export const validateDistributionTargets = async (rulePayload) => {
    // 1. Primary Target
    if (rulePayload.assignmentTarget) {
        await validateTarget(rulePayload.assignmentTarget, 'Primary');
    } else {
        throw new DistributionError('DISTRIBUTION_TARGET_REQUIRED', 'Assignment target is required.');
    }

    // 2. Fallback Target
    if (rulePayload.fallbackTarget) {
        await validateTarget(rulePayload.fallbackTarget, 'Fallback');
    }
};
