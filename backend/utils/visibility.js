import mongoose from "mongoose";

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};


/**
 * Enterprise Visibility Engine v2 — Hardened
 * Generates robust MongoDB $or filters based on User Data Scope and Team assignments.
 * Scopes: assigned | team | department | all
 */
export const getVisibilityFilter = async (user) => {
    if (!user) {
        console.warn(`[VISIBLE_AUDIT] ⛔ No user object provided — locking down to { _id: null }.`);
        return { _id: null };
    }

    const roleName = user.role?.name?.toLowerCase() || '';
    const userEmail = user.email?.toLowerCase() || '';
    const dataScope = user.dataScope?.toLowerCase() || '';

    console.log(`[VISIBLE_AUDIT] Starting for user: ${userEmail} scope: ${dataScope}`);

    const isSystemOwner = 
        userEmail === 'bharatproperties570@gmail.com' || 
        userEmail === 'shreykeshwar@gmail.com';

    if (isSystemOwner || dataScope === 'all') {
        console.log(`[VISIBLE_AUDIT] ✅ GLOBAL BYPASS GRANTED for: ${userEmail}`);
        return {};
    }

    const effectiveScope = dataScope || 'assigned';
    const userId = user?._id || user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId.toString())) {
        return { _id: null };
    }
    const userObjectId = new mongoose.Types.ObjectId(userId.toString());

    const rawTeams = Array.isArray(user.teams) ? user.teams : (user.team ? [user.team] : []);
    const userTeams = rawTeams
        .map(t => (t && typeof t === 'object' && t._id) ? t._id : t)
        .filter(t => t && mongoose.Types.ObjectId.isValid(t.toString()))
        .map(t => new mongoose.Types.ObjectId(t.toString()));

    const baseFilter = {
        $or: [
            { assignedTo: userObjectId },
            { owner: userObjectId },
            { 'assignment.assignedTo': userObjectId }
        ]
    };

    const everyoneFilter = {
        $and: [
            { 
                $or: [
                    { visibleTo: 'Everyone' },
                    { 'assignment.visibleTo': 'Everyone' }
                ]
            }
        ]
    };

    let finalFilter;
    if (effectiveScope === 'department' && user.department) {
        const TeamModel = mongoose.models.Team || mongoose.model('Team');
        const deptTeams = await TeamModel.find({ department: user.department, isActive: true }).select('_id');
        const deptTeamIds = deptTeams.map(t => t._id);

        everyoneFilter.$and.push({
            $or: [
                { teams: { $in: deptTeamIds } },
                { team: { $in: deptTeamIds } },
                { 'assignment.team': { $in: deptTeamIds } },
                { team: { $exists: false } },
                { teams: { $size: 0 } }
            ]
        });

        finalFilter = {
            $or: [
                ...baseFilter.$or,
                { department: user.department },
                { teams: { $in: deptTeamIds } },
                { team: { $in: deptTeamIds } },
                { 'assignment.team': { $in: deptTeamIds } },
                everyoneFilter
            ]
        };
    } else if (effectiveScope === 'team') {
        finalFilter = {
            $or: [
                ...baseFilter.$or,
                {
                    $and: [
                        { 
                            $or: [
                                { visibleTo: { $in: ['Team', 'Everyone'] } },
                                { 'assignment.visibleTo': { $in: ['Team', 'Everyone'] } },
                                { visibleTo: { $exists: false } }
                            ]
                        },
                        {
                            $or: [
                                { teams: { $in: userTeams } },
                                { team: { $in: userTeams } },
                                { 'assignment.team': { $in: userTeams } }
                            ]
                        }
                    ]
                },
                {
                    $and: [
                        { visibleTo: 'Everyone' },
                        { $or: [{ team: null }, { teams: { $size: 0 } }, { team: { $exists: false } }] }
                    ]
                }
            ]
        };
    } else {
        finalFilter = {
            $or: [
                ...baseFilter.$or,
                { visibleTo: 'Everyone' },
                { 'assignment.visibleTo': 'Everyone' }
            ]
        };
    }

    console.log(`[VISIBLE_AUDIT] Final Filter generated for effective scope: ${effectiveScope}`);
    return finalFilter;
};
