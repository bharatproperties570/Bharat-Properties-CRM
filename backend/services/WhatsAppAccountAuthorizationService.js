import mongoose from 'mongoose';

/**
 * WhatsAppAccountAuthorizationService
 * ================================================================
 * Centralized, reusable Role-Based Access Control (RBAC) service
 * for Multi-WhatsApp Account management and outbound messaging.
 * ================================================================
 */
class WhatsAppAccountAuthorizationService {
    /**
     * Check if a user has full Administrative access.
     */
    static isAdmin(user) {
        if (!user) return false;
        const userEmail = (user.email || '').toLowerCase().trim();
        const roleName = String(user.role?.name || user.role || '').toLowerCase().trim();

        if (
            userEmail === 'bharatproperties570@gmail.com' ||
            userEmail === 'shreykeshwar@gmail.com'
        ) {
            return true;
        }

        if (user.dataScope === 'all') return true;
        if (user.isAdmin === true) return true;
        if (roleName.includes('admin') || roleName.includes('owner') || roleName.includes('director')) {
            return true;
        }

        return false;
    }

    /**
     * Check if a user is a Team Manager / Lead.
     */
    static isTeamManager(user) {
        if (!user) return false;
        if (this.isAdmin(user)) return true;

        const roleName = String(user.role?.name || user.role || '').toLowerCase().trim();
        const dataScope = (user.dataScope || '').toLowerCase().trim();

        return (
            roleName.includes('manager') ||
            roleName.includes('lead') ||
            dataScope === 'department' ||
            dataScope === 'team'
        );
    }

    /**
     * Determine whether a user is authorized to use or view a specific WhatsApp account.
     *
     * Rules:
     * - ADMIN: Can access all accounts.
     * - TEAM MANAGER: Can access accounts allowed by role/department or unrestricted default accounts.
     * - NORMAL USER: Can access accounts explicitly allowed to them (by user ID, role, or department).
     * - BACKWARD COMPATIBILITY: Default account (Main API) with no restrictions is accessible to all
     *   authenticated users so existing automated and standard workflows are never locked out.
     * - SECURITY: Unrestricted non-default accounts are NOT automatically exposed to normal users.
     */
    static canUserAccessAccount(user, account) {
        if (!user || !account) return false;
        if (this.isAdmin(user)) return true;

        const userId = String(user._id || user.id || '');
        const userRoleName = String(user.role?.name || user.role || '').toLowerCase().trim();
        const userRoleId = String(user.role?._id || user.role || '').trim();
        const userDepartment = String(user.department || '').toLowerCase().trim();

        const allowedRoles = Array.isArray(account.allowedRoles) ? account.allowedRoles : [];
        const allowedDepartments = Array.isArray(account.allowedDepartments) ? account.allowedDepartments : [];
        const allowedUsers = Array.isArray(account.allowedUsers) ? account.allowedUsers : [];

        const hasRoleRestrictions = allowedRoles.length > 0;
        const hasDeptRestrictions = allowedDepartments.length > 0;
        const hasUserRestrictions = allowedUsers.length > 0;
        const hasAnyRestrictions = hasRoleRestrictions || hasDeptRestrictions || hasUserRestrictions;

        // 1. Explicit user assignment takes highest precedence
        if (hasUserRestrictions) {
            const userMatched = allowedUsers.some(u => {
                const uId = String(u?._id || u || '');
                return uId === userId;
            });
            if (userMatched) return true;
        }

        // 2. Role match
        if (hasRoleRestrictions) {
            const roleMatched = allowedRoles.some(r => {
                const rStr = String(r || '').toLowerCase().trim();
                return rStr === userRoleName || rStr === userRoleId.toLowerCase();
            });
            if (roleMatched) return true;
        }

        // 3. Department match
        if (hasDeptRestrictions && userDepartment) {
            const deptMatched = allowedDepartments.some(d => {
                const dStr = String(d || '').toLowerCase().trim();
                return dStr === userDepartment;
            });
            if (deptMatched) return true;
        }

        // 4. If account has explicit restrictions and none matched -> REJECT
        if (hasAnyRestrictions) {
            return false;
        }

        // 5. Account has NO restrictions configured:
        // - If it's the Default (Main API) account: Allow for backward compatibility
        if (account.isDefault || account.id === 'legacy_default' || account._id === 'legacy_default') {
            return true;
        }

        // - For non-default accounts without explicit restrictions:
        // Team managers can access if their department is active, but normal users do NOT automatically receive it
        if (this.isTeamManager(user)) {
            return true;
        }

        return false;
    }

    /**
     * Filter an array of WhatsApp accounts to only those the user is authorized to see.
     */
    static filterAuthorizedAccounts(user, accounts = []) {
        if (!user || !Array.isArray(accounts)) return [];
        if (this.isAdmin(user)) return accounts;
        return accounts.filter(account => this.canUserAccessAccount(user, account));
    }

    /**
     * Validate whether a user is authorized to send outbound messages through targetAccount.
     *
     * @param {Object} user - Authenticated req.user
     * @param {string|null} targetAccount - integrationId, phoneNumberId, or null (for default)
     * @returns {Promise<{ authorized: boolean, reason?: string, integration?: Object }>}
     */
    static async assertCanSend(user, targetAccount = null) {
        if (!user) {
            return { authorized: false, reason: "Authentication required" };
        }

        const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;

        // 1. Explicit Account Target
        if (targetAccount && targetAccount !== 'legacy_default') {
            const query = mongoose.Types.ObjectId.isValid(targetAccount)
                ? { _id: targetAccount, status: 'ACTIVE' }
                : { phoneNumberId: String(targetAccount), status: 'ACTIVE' };

            const integration = await WhatsAppIntegration.findOne(query).lean();
            if (!integration) {
                return {
                    authorized: false,
                    reason: `Target WhatsApp account '${targetAccount}' not found or inactive`
                };
            }

            const allowed = this.canUserAccessAccount(user, integration);
            if (!allowed) {
                return {
                    authorized: false,
                    reason: `Access denied: User '${user.email || user.fullName}' is not authorized to send via WhatsApp account '${integration.displayPhoneNumber || integration.accountLabel || targetAccount}'`
                };
            }

            return { authorized: true, integration };
        }

        // 2. Default Account Target (no explicit target provided or 'legacy_default')
        const defaultIntegration = await WhatsAppIntegration.findOne({ isDefault: true, status: 'ACTIVE' }).lean();
        const accountToCheck = defaultIntegration || {
            id: 'legacy_default',
            accountLabel: 'Main Official WhatsApp API',
            isDefault: true,
            allowedRoles: [],
            allowedDepartments: [],
            allowedUsers: []
        };

        const allowed = this.canUserAccessAccount(user, accountToCheck);
        if (!allowed) {
            return {
                authorized: false,
                reason: `Access denied: User '${user.email || user.fullName}' is not authorized to use the default WhatsApp account`
            };
        }

        return { authorized: true, integration: defaultIntegration || null };
    }
}

export default WhatsAppAccountAuthorizationService;
