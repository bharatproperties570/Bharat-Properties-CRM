import path from 'path';

/**
 * Enterprise Intake Authorization Engine (Gate 2R.12)
 * 
 * Enforces three strictly separated security policies:
 * Policy A: Viewing Policy (Intake detail & image serving)
 * Policy B: Claim Eligibility Policy (Unassigned intake candidate claiming)
 * Policy C: Post-Claim Access (Inherited via Policy A)
 * 
 * Rules:
 * 1. Zero hardcoded email address bypasses.
 * 2. Role-as-Ceiling: A user's effective dataScope cannot exceed their Role's maximum allowable scope.
 *    - Sales Executive: strictly capped at 'assigned'.
 *    - Sales Manager: capped at 'team' or 'department'.
 *    - Admin / Super Admin: permitted 'all'.
 */

/**
 * Policy A: Can the user view this intake and its image attachment?
 * @param {Object} intake - Mongoose Intake document or plain object
 * @param {Object} user - Hydrated user object from req.user
 * @returns {boolean}
 */
export const canViewIntake = (intake, user) => {
    if (!user || !user.isActive) return false;
    if (!intake) return false;

    const roleName = String(user.role?.name || user.role || '').toLowerCase();
    const isSystemAdmin = Boolean(user.role?.isSystemRole && (roleName === 'admin' || roleName === 'super admin'));

    // 1. Admin / Super Admin: Full platform oversight across all intakes
    if (isSystemAdmin) {
        return true;
    }

    // Determine Role Ceiling
    const userScope = String(user.dataScope || 'assigned').toLowerCase();
    let effectiveScope = userScope;

    if (roleName === 'sales executive') {
        effectiveScope = 'assigned'; // Role ceiling enforces assigned only
    } else if (roleName === 'sales manager' && effectiveScope === 'all') {
        effectiveScope = 'team'; // Role ceiling caps at team
    }

    const userIdStr = String(user._id || user.id || '');
    const createdByStr = intake.createdBy ? String(intake.createdBy._id || intake.createdBy) : null;
    const assignedToStr = intake.assignedTo ? String(intake.assignedTo._id || intake.assignedTo) : null;

    // 2. Sales Manager (team or department scope)
    if (roleName === 'sales manager' || effectiveScope === 'team' || effectiveScope === 'department') {
        // Can view owned or assigned
        if (createdByStr === userIdStr || assignedToStr === userIdStr) {
            return true;
        }
        // Managerial triage authority: Can view unassigned intakes
        if (!createdByStr && !assignedToStr) {
            return true;
        }
        // Team-based access
        const userTeams = (Array.isArray(user.teams) ? user.teams : (user.team ? [user.team] : []))
            .map(t => String(t?._id || t));
        const intakeTeamStr = intake.team ? String(intake.team._id || intake.team) : null;
        if (intakeTeamStr && userTeams.includes(intakeTeamStr)) {
            return true;
        }
        // Department-based access if effectiveScope is department
        if (effectiveScope === 'department' && user.department && intake.department === user.department) {
            return true;
        }
        return false;
    }

    // 3. Sales Executive (strictly assigned scope)
    if (roleName === 'sales executive' || effectiveScope === 'assigned') {
        // Can ONLY view records created by them or assigned to them
        if (createdByStr === userIdStr || assignedToStr === userIdStr) {
            return true;
        }
        // Strictly FORBIDDEN from viewing unassigned intakes or cross-agent intakes!
        return false;
    }

    return false;
};

/**
 * Policy B: Can the user claim ownership of an unassigned intake?
 * @param {Object} intake - Mongoose Intake document or plain object
 * @param {Object} user - Hydrated user object from req.user
 * @returns {boolean}
 */
export const canClaimIntake = (intake, user) => {
    if (!user || !user.isActive) return false;
    if (!intake) return false;

    const roleName = String(user.role?.name || user.role || '').toLowerCase();
    const isSystemAdmin = Boolean(user.role?.isSystemRole && (roleName === 'admin' || roleName === 'super admin')) || roleName === 'admin' || roleName === 'super admin';

    // Rule 1: Only Sales department users or Admins can claim deals
    const userDept = String(user.department || '').toLowerCase();
    if (!isSystemAdmin && userDept !== 'sales') {
        return false;
    }

    // Rule 2: Only eligible sales roles may claim
    const eligibleRoles = ['sales executive', 'sales manager', 'admin', 'super admin'];
    if (!eligibleRoles.includes(roleName)) {
        return false;
    }

    // Rule 3: Record must be genuinely unassigned
    const createdByStr = intake.createdBy ? String(intake.createdBy._id || intake.createdBy) : null;
    const assignedToStr = intake.assignedTo ? String(intake.assignedTo._id || intake.assignedTo) : null;
    if (createdByStr || assignedToStr) {
        return false;
    }

    // Rule 4: Record must be in an actionable status
    const unclaimableStatuses = ['Archived', 'Failed', 'Deal Linked'];
    if (unclaimableStatuses.includes(intake.status)) {
        return false;
    }

    return true;
};
