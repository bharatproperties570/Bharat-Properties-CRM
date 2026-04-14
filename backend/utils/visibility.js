import mongoose from "mongoose";

/**
 * Enterprise Visibility Engine v2 — Hardened
 * Generates robust MongoDB $or filters based on User Data Scope and Team assignments.
 * Scopes: assigned | team | department | all
 *
 * SECURITY RULES:
 * 1. isElevated ONLY fires if dataScope==='all' or the user is the system owner email.
 *    Role names (admin, manager) do NOT bypass scope — they use their configured dataScope.
 * 2. team scope with empty teams logs a WARN and falls through to assigned scope.
 * 3. Every resolution path emits a [VISIBLE_AUDIT] log for production diagnostics.
 */
export const getVisibilityFilter = async (user) => {
    if (!user) {
        console.warn(`[VISIBLE_AUDIT] ⛔ No user object provided — locking down to { _id: null }.`);
        return { _id: null };
    }

    // 0. Safety: Detect unhydrated token-only objects
    if (!user.dataScope && !user.teams && user.id) {
        console.warn(`[VISIBLE_AUDIT] ⚠️  User ${user.id} is unhydrated (no dataScope/teams). Middleware may be missing.`);
    }

    const roleName = user.role?.name?.toLowerCase() || '';
    const userEmail = user.email?.toLowerCase() || '';

    // 1. STRICT Elevated Check: ONLY full-scope users bypass the filter.
    //    Role names (admin, manager) alone do NOT grant bypass — their dataScope config does.
    const OWNER_EMAIL = 'bharatproperties570@gmail.com';
    const isElevated = user.dataScope === 'all' || userEmail === OWNER_EMAIL;

    console.log(
        `[VISIBLE_AUDIT] 🚦 User: ${user.fullName || user.email} | ` +
        `Role: ${roleName} | Scope: ${user.dataScope} | Elevated: ${isElevated}`
    );

    if (isElevated) {
        console.log(`[VISIBLE_AUDIT] ✅ Full Access — dataScope=all or system owner.`);
        return {};
    }

    // 2. Validate ObjectId
    const userId = user?._id || user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId.toString())) {
        console.warn(`[VISIBLE_AUDIT] ⛔ No valid ObjectId for user. Locking down.`);
        return { _id: null };
    }
    const userObjectId = new mongoose.Types.ObjectId(userId.toString());

    // 3. Resolve team IDs (supports both legacy `team` and plural `teams`)
    const rawTeams = Array.isArray(user.teams) ? user.teams : (user.team ? [user.team] : []);
    const userTeams = rawTeams
        .map(t => (t && typeof t === 'object' && t._id) ? t._id : t)
        .filter(t => t && mongoose.Types.ObjectId.isValid(t.toString()))
        .map(t => new mongoose.Types.ObjectId(t.toString()));

    // 4. Department Scope: All teams in the user's department
    if (user.dataScope === 'department' && user.department) {
        const TeamModel = mongoose.model('Team');
        const deptTeams = await TeamModel.find({ department: user.department, isActive: true }).select('_id');
        const deptTeamIds = deptTeams
            .map(t => t._id)
            .filter(id => mongoose.Types.ObjectId.isValid(id.toString()));

        console.log(
            `[VISIBLE_AUDIT] 🏢 Department scope for ${user.department} — ` +
            `${deptTeamIds.length} teams found.`
        );

        return {
            $or: [
                { assignedTo: userObjectId },
                { owner: userObjectId },
                { assign: { $in: [userObjectId] } },
                { 'assignment.assignedTo': userObjectId },
                { teams: { $in: deptTeamIds } },
                { team: { $in: deptTeamIds } },
                { 'assignment.team': { $in: deptTeamIds } },
                { visibleTo: { $in: ['Everyone', 'Public'] } },
                { 'assignment.visibleTo': { $in: ['Everyone', 'Public'] } },
                { owner: null },
                { owner: { $exists: false } }
            ]
        };
    }

    // 5. Team Scope: Restricted to user's assigned teams
    if (user.dataScope === 'team') {
        if (userTeams.length === 0) {
            console.warn(
                `[VISIBLE_AUDIT] ⚠️  Team scope requested but user ${user.email} has no teams. ` +
                `Falling back to assigned scope for safety.`
            );
            // Falls through to assigned scope below
        } else {
            console.log(
                `[VISIBLE_AUDIT] 👥 Team scope — ${userTeams.length} team(s): ` +
                `[${userTeams.map(t => t.toString()).join(', ')}]`
            );
            return {
                $or: [
                    { assignedTo: userObjectId },
                    { owner: userObjectId },
                    { assign: { $in: [userObjectId] } },
                    { 'assignment.assignedTo': userObjectId },
                    { teams: { $in: userTeams } },
                    { team: { $in: userTeams } },
                    { 'assignment.team': { $in: userTeams } },
                    { visibleTo: { $in: ['Everyone', 'Public'] } },
                    { 'assignment.visibleTo': { $in: ['Everyone', 'Public'] } },
                    { owner: null },
                    { owner: { $exists: false } }
                ]
            };
        }
    }

    // 6. Default: Assigned Scope (Strict isolation — only own records + public)
    console.log(`[VISIBLE_AUDIT] 🔒 Assigned scope — strict isolation for ${user.email}.`);
    return {
        $or: [
            { assignedTo: userObjectId },
            { owner: userObjectId },
            { assign: { $in: [userObjectId] } },
            { 'assignment.assignedTo': userObjectId },
            { visibleTo: { $in: ['Everyone', 'Public'] } },
            { 'assignment.visibleTo': { $in: ['Everyone', 'Public'] } }
        ]
    };
};
