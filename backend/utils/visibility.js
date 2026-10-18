import mongoose from "mongoose";

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Enterprise Visibility Engine v3 — Hardened Regional & Team Isolation
 * Generates robust MongoDB $or filters based on User Data Scope, Department, and Team assignments.
 * Scopes: assigned | team | department | all
 *
 * ENTERPRISE REGIONAL ISOLATION RULES:
 * 1. Global Bypass (dataScope === 'all' or root system owner emails): Returns {} (full visibility).
 * 2. Department Scope: User sees base records assigned to them + records belonging to their department/teams
 *    within the department where visibility is not restricted to private.
 * 3. Team Scope: User sees base records assigned to them + records belonging to their assigned team(s).
 *    Cross-team leakage (e.g. Kurukshetra deals showing to Mohali team) is strictly prevented even if
 *    records have visibleTo: 'Everyone', because team boundaries take absolute precedence.
 * 4. Truly Global Records: Records with visibleTo in ['Everyone', 'Public'] that have NO team and NO department
 *    assigned are visible to all authenticated scopes.
 * 5. Assigned Scope: User only sees records directly assigned to them or unassigned truly global records.
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
            { assign: userObjectId },
            { 'assignment.assignedTo': userObjectId }
        ]
    };

    // Truly global records have visibleTo: Everyone/Public AND no team and no department attached
    const trulyGlobalFilter = {
        $and: [
            {
                $or: [
                    { visibleTo: { $in: ['Everyone', 'Public'] } },
                    { 'assignment.visibleTo': { $in: ['Everyone', 'Public'] } }
                ]
            },
            {
                $and: [
                    { $or: [{ team: null }, { team: { $exists: false } }] },
                    { $or: [{ teams: { $size: 0 } }, { teams: { $exists: false } }, { teams: null }] },
                    { $or: [{ 'assignment.team': { $size: 0 } }, { 'assignment.team': { $exists: false } }, { 'assignment.team': null }] }
                ]
            }
        ]
    };

    let finalFilter;
    if (effectiveScope === 'department' && user.department) {
        const TeamModel = mongoose.models.Team || mongoose.model('Team');
        const deptTeams = await TeamModel.find({ department: user.department, isActive: true }).select('_id');
        const deptTeamIds = deptTeams.map(t => t._id);

        finalFilter = {
            $or: [
                ...baseFilter.$or,
                {
                    $and: [
                        { 
                            $or: [
                                { visibleTo: { $in: ['Department', 'Team', 'Everyone', 'Public'] } },
                                { 'assignment.visibleTo': { $in: ['Department', 'Team', 'Everyone', 'Public'] } },
                                { visibleTo: { $exists: false } },
                                { visibleTo: null },
                                { 'assignment.visibleTo': { $exists: false } },
                                { 'assignment.visibleTo': null }
                            ]
                        },
                        {
                            $or: [
                                { department: user.department },
                                { teams: { $in: deptTeamIds } },
                                { team: { $in: deptTeamIds } },
                                { 'assignment.team': { $in: deptTeamIds } }
                            ]
                        }
                    ]
                },
                trulyGlobalFilter
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
                                { visibleTo: { $in: ['Team', 'Everyone', 'Public'] } },
                                { 'assignment.visibleTo': { $in: ['Team', 'Everyone', 'Public'] } },
                                { visibleTo: { $exists: false } },
                                { visibleTo: null },
                                { 'assignment.visibleTo': { $exists: false } },
                                { 'assignment.visibleTo': null }
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
                trulyGlobalFilter
            ]
        };
    } else {
        // Assigned Scope (Individual Agent): records assigned to user or truly global unassigned
        finalFilter = {
            $or: [
                ...baseFilter.$or,
                trulyGlobalFilter
            ]
        };
    }

    console.log(`[VISIBLE_AUDIT] Final Filter generated for effective scope: ${effectiveScope}`);
    return finalFilter;
};

export default getVisibilityFilter;
