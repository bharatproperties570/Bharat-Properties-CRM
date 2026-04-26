import mongoose from "mongoose";

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};


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

    // 1. Intelligent Scope Resolution:
    //    If dataScope is not set, Admins default to 'all', others to 'assigned'.
    const effectiveScope = user.dataScope || (roleName.includes('admin') ? 'all' : 'assigned');

    const OWNER_EMAIL = 'bharatproperties570@gmail.com';
    const isElevated = effectiveScope === 'all' || userEmail === OWNER_EMAIL;

    console.log(
        `[VISIBLE_AUDIT] 🚦 User: ${user.fullName || user.email} | ` +
        `Role: ${roleName} | Effective Scope: ${effectiveScope} | Elevated: ${isElevated}`
    );

    if (isElevated) {
        console.log(`[VISIBLE_AUDIT] ✅ Full Access granted.`);
        return {};
    }

    // 2. Validate ObjectId
    const userId = user?._id || user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId.toString())) {
        console.warn(`[VISIBLE_AUDIT] ⛔ No valid ObjectId for user. Locking down.`);
        return { _id: null };
    }
    const userObjectId = new mongoose.Types.ObjectId(userId.toString());

    // 3. Resolve team IDs
    const rawTeams = Array.isArray(user.teams) ? user.teams : (user.team ? [user.team] : []);
    const userTeams = rawTeams
        .map(t => (t && typeof t === 'object' && t._id) ? t._id : t)
        .filter(t => t && mongoose.Types.ObjectId.isValid(t.toString()))
        .map(t => new mongoose.Types.ObjectId(t.toString()));

    // --- ENTERPRISE VISIBILITY CORE ---
    const baseFilter = {
        $or: [
            { assignedTo: userObjectId },
            { owner: userObjectId },
            { 'assignment.assignedTo': userObjectId }
        ]
    };

    // Scoped Everyone records: If user is in a department, "Everyone" only means "Everyone in my department".
    // If user has NO department, "Everyone" means truly global.
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

    // 4. Combine based on effective scope
    let finalFilter;
    if (effectiveScope === 'department' && user.department) {
        // Department scope: base + teams in my department
        const TeamModel = mongoose.models.Team || mongoose.model('Team');
        const deptTeams = await TeamModel.find({ department: user.department, isActive: true }).select('_id');
        const deptTeamIds = deptTeams.map(t => t._id);

        // For department users, "Everyone" records are also constrained to their department teams
        // to prevent regional leakage (Mohali vs Kurukshetra).
        everyoneFilter.$and.push({
            $or: [
                { teams: { $in: deptTeamIds } },
                { team: { $in: deptTeamIds } },
                { 'assignment.team': { $in: deptTeamIds } },
                { team: { $exists: false } }, // Allow truly orphaned Everyone records? User requested strictness.
                { teams: { $size: 0 } }
            ]
        });

        finalFilter = {
            $or: [
                ...baseFilter.$or,
                { teams: { $in: deptTeamIds } },
                { team: { $in: deptTeamIds } },
                { 'assignment.team': { $in: deptTeamIds } },
                everyoneFilter
            ]
        };
    } else if (effectiveScope === 'team') {
        // Team scope: base + records in my specific teams
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
                // Include truly global Everyone records if they aren't tied to any team
                {
                    $and: [
                        { visibleTo: 'Everyone' },
                        { $or: [{ team: null }, { teams: { $size: 0 } }, { team: { $exists: false } }] }
                    ]
                }
            ]
        };
    } else {
        // Assigned Scope (Default for non-admins)
        finalFilter = {
            $or: [
                ...baseFilter.$or,
                // Only show Everyone records if they are TRULY global (unassigned to any specific team)
                // or if the user is explicitly interested.
                {
                    $and: [
                        { visibleTo: 'Everyone' },
                        { $or: [{ team: null }, { teams: { $size: 0 } }, { team: { $exists: false } }] }
                    ]
                }
            ]
        };
    }

    console.log(`[VISIBLE_AUDIT] Final Filter generated for effective scope: ${effectiveScope}`);
    return finalFilter;
};


