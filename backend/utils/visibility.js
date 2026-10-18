import mongoose from "mongoose";

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Enterprise Visibility Engine — 3-Tier RBAC Architecture
 * 
 * CRM UNIVERSAL VISIBILITY RULES:
 * 1. Private:
 *    - Only the assigned user (assignedTo / owner / assign / assignment.assignedTo) + Admin can see it.
 *    - Records marked 'Private' are strictly excluded from other team members.
 * 2. Team:
 *    - Members of the record's team (userTeams) + Admin can see it.
 *    - Records marked 'Private' are strictly excluded from team members.
 *    - Other teams cannot see it.
 * 3. Everyone:
 *    - If a record is explicitly saved with visibleTo: 'Everyone' (or 'Public' / 'All Users'),
 *      it is visible to ALL teams, all users, and all admins across the entire CRM.
 * 4. Admin (Super Admin / dataScope: 'all'):
 *    - Full visibility across all entities, users, and teams.
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

    // Rule 4: Super Admin / System Owners have full unrestricted visibility
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

    // ─── 1. PRIVATE RULE ───
    // Record is directly assigned to the user (creator / owner / assignedTo / RM).
    // The assigned user can always see their own records (whether Private, Team, or Everyone).
    const privateAssignedFilter = {
        $or: [
            { assignedTo: userObjectId },
            { owner: userObjectId },
            { assign: userObjectId },
            { 'assignment.assignedTo': userObjectId }
        ]
    };

    // ─── 3. EVERYONE RULE ───
    // If a record is explicitly saved as 'Everyone' (or 'Public' / 'All Users'),
    // it is visible to ALL teams, all users, and all admins across the entire CRM.
    const everyoneFilter = {
        $or: [
            { visibleTo: { $in: ['Everyone', 'Public', 'All Users'] } },
            { 'assignment.visibleTo': { $in: ['Everyone', 'Public', 'All Users'] } }
        ]
    };

    // ─── 2. TEAM RULE ───
    // If 'Team' is selected (or default), everyone in that team + admin sees the record.
    // Records marked 'Private' are strictly excluded from other team members.
    let teamFilter;
    if (effectiveScope === 'department' && user.department) {
        const TeamModel = mongoose.models.Team || mongoose.model('Team');
        const deptTeams = await TeamModel.find({ department: user.department, isActive: true }).select('_id');
        const deptTeamIds = deptTeams.map(t => t._id);

        teamFilter = {
            $and: [
                {
                    visibleTo: { $nin: ['Private'] },
                    'assignment.visibleTo': { $nin: ['Private'] }
                },
                {
                    $or: [
                        { department: user.department },
                        { teams: { $in: deptTeamIds } },
                        { team: { $in: deptTeamIds } },
                        { 'assignment.team': { $in: deptTeamIds } },
                        { teams: { $in: userTeams } },
                        { team: { $in: userTeams } },
                        { 'assignment.team': { $in: userTeams } }
                    ]
                }
            ]
        };
    } else {
        teamFilter = {
            $and: [
                {
                    visibleTo: { $nin: ['Private'] },
                    'assignment.visibleTo': { $nin: ['Private'] }
                },
                {
                    $or: [
                        { teams: { $in: userTeams } },
                        { team: { $in: userTeams } },
                        { 'assignment.team': { $in: userTeams } }
                    ]
                }
            ]
        };
    }

    // Combine the 3 universal visibility pillars:
    const finalFilter = {
        $or: [
            ...privateAssignedFilter.$or,
            teamFilter,
            everyoneFilter
        ]
    };

    console.log(`[VISIBLE_AUDIT] Final Filter generated for effective scope: ${effectiveScope}`);
    return finalFilter;
};

export default getVisibilityFilter;
