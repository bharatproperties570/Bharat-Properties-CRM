/**
 * usePermissions — Frontend Permission Engine
 *
 * Reads the currently logged-in user's role.moduleAccess and dataScope
 * to enforce visibility controls in the UI.
 *
 * Usage:
 *   const { canDo, isElevated, dataScope } = usePermissions();
 *   if (!canDo('leads', 'create')) return <AccessDenied />;
 *
 * Module names (must match Role.moduleAccess keys):
 *   leads | deals | contacts | inventory | projects | activities |
 *   reports | settings | users | campaigns
 *
 * Actions: 'view' | 'create' | 'edit' | 'delete'
 */

import { useMemo } from 'react';
import { useUserContext } from '../context/UserContext';

const OWNER_EMAIL = 'bharatproperties570@gmail.com';

/**
 * Main permission hook
 */
export const usePermissions = () => {
    const { currentUser } = useUserContext();

    const permissions = useMemo(() => {
        if (!currentUser) {
            return {
                canDo: () => false,
                isElevated: false,
                dataScope: 'assigned',
                role: null,
                currentUser: null
            };
        }

        // System owner, dataScope=all, or Admin/Super Admin role → full bypass
        // Get role name from currentUser (may be populated object or just an ID)
        let roleName = currentUser.role?.name;

        // Fallback: If role is a string ID, try to find the role name in the global roles list
        if (!roleName && typeof currentUser.role === 'string') {
            const roleObj = roles?.find(r => r._id === currentUser.role);
            if (roleObj) roleName = roleObj.name;
        }

        // System owner, dataScope=all, or Admin/Super Admin role → full bypass
        const elevated =
            currentUser.email?.toLowerCase() === OWNER_EMAIL ||
            currentUser.dataScope === 'all' ||
            roleName?.toLowerCase() === 'admin' ||
            roleName?.toLowerCase() === 'super admin';

        /**
         * canDo(module, action)
         * Returns true if the current user has permission.
         * Falls back to true for elevated users.
         */
        const canDo = (module, action = 'view') => {
            if (elevated) return true;

            // role may be an object (populated) or just an ID string
            const role = currentUser.role;
            if (!role || typeof role !== 'object') {
                // Role not populated — deny by default (safe)
                return false;
            }

            const moduleAccess = role.moduleAccess || {};
            const modulePerms = moduleAccess[module];
            if (!modulePerms) return false;

            return modulePerms[action] === true;
        };

        /**
         * canAccessModule(module)
         * Shorthand: can the user VIEW this module at all?
         */
        const canAccessModule = (module) => canDo(module, 'view');

        return {
            canDo,
            canAccessModule,
            isElevated: elevated,
            dataScope: currentUser.dataScope || 'assigned',
            department: currentUser.department || null,
            role: currentUser.role?.name || currentUser.role || null,
            currentUser
        };
    }, [currentUser]);

    return permissions;
};

/**
 * PermissionGate — Wrapper component to conditionally render children
 * based on module + action permissions.
 *
 * Usage:
 *   <PermissionGate module="leads" action="create">
 *     <AddLeadButton />
 *   </PermissionGate>
 *
 *   <PermissionGate module="settings" action="edit" fallback={<p>Access Denied</p>}>
 *     <SettingsPanel />
 *   </PermissionGate>
 */
export const PermissionGate = ({ module, action = 'view', fallback = null, children }) => {
    const { canDo } = usePermissions();
    return canDo(module, action) ? children : fallback;
};

export default usePermissions;
