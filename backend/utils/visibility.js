import mongoose from "mongoose";

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Enterprise Visibility Engine — Multi-Tenant & 3-Tier RBAC Architecture
 *
 * CRM UNIVERSAL VISIBILITY & MULTI-TENANCY RULES:
 * 0. Multi-Tenancy Guard:
 *    - If user belongs to a tenant (user.tenantId or user.tenant), all returned queries
 *      are strictly locked to { tenantId: userTenantId }.
 *    - Even with dataScope: 'all', a tenant-scoped user can NEVER view other tenants' records.
 *    - Cross-tenant leakage across "Everyone" / "Public" records is strictly prevented.
 * 1. Private:
 *    - Only the assigned user (assignedTo / owner / assign / assignment.assignedTo) + Admin can see it.
 *    - Records marked 'Private' are strictly excluded from other team members.
 * 2. Team:
 *    - Members of the record's team (userTeams) + Admin can see it.
 *    - Records marked 'Private' are strictly excluded from team members.
 *    - Other teams cannot see it.
 * 3. Everyone:
 *    - If a record is explicitly saved with visibleTo: 'Everyone' (or 'Public' / 'All Users'),
 *      it is visible to all teams and users within that user's TENANT (or CRM for non-tenant users).
 * 4. Admin (Super Admin / dataScope: 'all'):
 *    - Platform Super Admin (without a tenant restriction): Full visibility across all entities, users, and teams.
 *    - Tenant Admin (with tenant restriction): Full visibility across all entities within their tenant ONLY.
 * 5. Deny by default:
 *    - Unauthenticated requests or invalid users return { _id: null }.
 */
export const getVisibilityFilter = async (user) => {
    if (!user) {
        console.warn(`[VISIBLE_AUDIT] ⛔ No user object provided — locking down to { _id: null }.`);
        return { _id: null };
    }

    const roleName = user.role?.name?.toLowerCase() || '';
    const userEmail = user.email?.toLowerCase() || '';
    const dataScope = user.dataScope?.toLowerCase() || '';

    // Extract tenantId if present
    const rawTenantId = user.tenantId || user.tenant;
    const userTenantId = (rawTenantId && mongoose.Types.ObjectId.isValid(rawTenantId.toString()))
        ? new mongoose.Types.ObjectId(rawTenantId.toString())
        : null;

    console.log(`[VISIBLE_AUDIT] Starting for user: ${userEmail} scope: ${dataScope} tenant: ${userTenantId || 'GLOBAL'}`);

    const isSystemOwner =
        userEmail === 'bharatproperties570@gmail.com' ||
        userEmail === 'shreykeshwar@gmail.com';

    // Rule 4A: Platform Super Admin / System Owners WITHOUT a tenant assignment have full unrestricted visibility
    if (isSystemOwner && !userTenantId) {
        console.log(`[VISIBLE_AUDIT] ✅ GLOBAL PLATFORM BYPASS GRANTED for: ${userEmail}`);
        return {};
    }

    // Rule 4B: dataScope: 'all'
    if (dataScope === 'all') {
        if (userTenantId) {
            console.log(`[VISIBLE_AUDIT] ✅ TENANT-SCOPED ALL GRANTED for tenant: ${userTenantId}`);
            return { tenantId: userTenantId };
        }
        if (isSystemOwner || roleName === 'super admin') {
            console.log(`[VISIBLE_AUDIT] ✅ GLOBAL ALL GRANTED for system super admin: ${userEmail}`);
            return {};
        }
        console.warn(`[VISIBLE_AUDIT] ⛔ Unverified dataScope: 'all' without tenant or superadmin — falling back to assigned.`);
    }

    const effectiveScope = (dataScope === 'department' || dataScope === 'team' || dataScope === 'assigned')
        ? dataScope
        : 'assigned';

    const userId = user?._id || user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId.toString())) {
        console.warn(`[VISIBLE_AUDIT] ⛔ Invalid userId provided — locking down to { _id: null }.`);
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
    const privateAssignedFilter = {
        $or: [
            { assignedTo: userObjectId },
            { owner: userObjectId },
            { assign: userObjectId },
            { 'assignment.assignedTo': userObjectId }
        ]
    };

    // ─── 3. EVERYONE RULE ───
    // Explicitly visible to 'Everyone', 'Public', or 'All Users'
    const everyoneFilter = {
        $or: [
            { visibleTo: { $in: ['Everyone', 'Public', 'All Users'] } },
            { 'assignment.visibleTo': { $in: ['Everyone', 'Public', 'All Users'] } }
        ]
    };

    // ─── 2. TEAM RULE ───
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
    const baseFilter = {
        $or: [
            ...privateAssignedFilter.$or,
            teamFilter,
            everyoneFilter
        ]
    };

    // Enforce Tenant Boundary:
    // If user has a tenantId, the entire visibility filter MUST be constrained to that tenant
    if (userTenantId) {
        console.log(`[VISIBLE_AUDIT] Constraining visibility filter to tenant: ${userTenantId}`);
        return {
            $and: [
                { tenantId: userTenantId },
                baseFilter
            ]
        };
    }

    console.log(`[VISIBLE_AUDIT] Final Filter generated for effective scope: ${effectiveScope}`);
    return baseFilter;
};

export default getVisibilityFilter;
