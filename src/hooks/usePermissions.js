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
    const { currentUser, roles, loading } = useUserContext();

    const permissions = useMemo(() => {
        if (!currentUser) {
            return {
                canDo: () => false,
                isElevated: false,
                dataScope: 'assigned',
                role: null,
                currentUser: null,
                isLoading: loading
            };
        }

        // Dynamic elevation check: 
        // We re-check isAdmin logic here because the initial calculation in UserContext 
        // might have happened before roles were populated/resolved.
        const role = currentUser.role;
        let resolvedRole = role;
        
        // Resolve role ID to full object if needed
        if (role && typeof role === 'string' && roles?.length > 0) {
            const foundRole = roles.find(r => r._id === role || r.id === role);
            if (foundRole) resolvedRole = foundRole;
        }

        const roleName = resolvedRole?.name || (typeof resolvedRole === 'string' ? resolvedRole : '');
        const elevated = currentUser.isAdmin === true || 
                        currentUser.dataScope === 'all' || 
                        currentUser.email === 'bharatproperties570@gmail.com' ||
                        roleName.toLowerCase().includes('admin');

        /**
         * canDo(module, action)
         * Returns true if the current user has permission.
         */
        const canDo = (module, action = 'view') => {
            if (elevated) return true;

            if (!resolvedRole || typeof resolvedRole !== 'object') {
                return false;
            }

            const moduleAccess = resolvedRole.moduleAccess || {};
            const modulePerms = moduleAccess[module];
            if (!modulePerms) return false;

            // Handle both boolean true and "true" string
            return modulePerms[action] === true || modulePerms[action] === "true";
        };

        const canAccessModule = (module) => canDo(module, 'view');

        return {
            canDo,
            canAccessModule,
            isElevated: elevated,
            dataScope: currentUser.dataScope || 'assigned',
            department: currentUser.department || null,
            role: roleName || null,
            currentUser,
            isLoading: loading
        };
    }, [currentUser, roles, loading]);

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
