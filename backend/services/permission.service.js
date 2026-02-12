/**
 * Permission Service
 * Core logic for calculating and checking user permissions
 */

import { DEPARTMENTS } from '../config/departments.config.js';

/**
 * Calculate final permissions for a user
 * Formula: Department Default ⊕ Role Permission ⊕ Data Scope ⊕ Financial Overrides
 */
export const calculateUserPermissions = async (user) => {
    if (!user.department || !user.role) {
        throw new Error('User must have department and role assigned');
    }

    // Try to get from cache first
    const roleId = user.role._id || user.role;
    const cacheService = await import('./cache.service.js');
    const cached = await cacheService.getCachedUserPermissions(user._id.toString(), roleId.toString());

    if (cached) {
        return cached;
    }

    // Get department defaults
    const department = DEPARTMENTS[user.department.toUpperCase()];
    if (!department) {
        throw new Error(`Invalid department: ${user.department}`);
    }

    // Populate role if it's just an ID
    let role = user.role;
    if (typeof role === 'string' || role._id) {
        const Role = (await import('../models/Role.js')).default;
        role = await Role.findById(user.role._id || user.role);
    }

    if (!role) {
        throw new Error('User role not found');
    }

    // Merge module access: Role permissions override department defaults
    const moduleAccess = mergeModuleAccess(department.defaultModules, role.moduleAccess);

    // Data scope: User's dataScope overrides role's defaultDataScope
    const dataScope = user.dataScope || role.defaultDataScope || department.defaultDataScope;

    // Financial permissions: User-level overrides role-level overrides department-level
    const financialPermissions = mergeFinancialPermissions(
        department.defaultFinancialAccess,
        role.financialPermissions,
        user.financialPermissions
    );

    // Approval rights from role
    const approvalRights = role.approvalRights || {};

    const permissions = {
        department: user.department,
        role: {
            id: role._id,
            name: role.name
        },
        moduleAccess,
        dataScope,
        locationScope: user.locationScope || {},
        financialPermissions,
        approvalRights,
        dashboardType: department.dashboardType
    };

    // Cache the result
    await cacheService.cacheUserPermissions(user._id.toString(), roleId.toString(), permissions);

    return permissions;
};

/**
 * Merge module access from department defaults and role permissions
 */
const mergeModuleAccess = (departmentModules, roleModules) => {
    const merged = {};

    // Get all unique module names
    const allModules = new Set([
        ...Object.keys(departmentModules || {}),
        ...Object.keys(roleModules || {})
    ]);

    allModules.forEach(module => {
        const deptAccess = departmentModules?.[module] || { view: false, create: false, edit: false, delete: false };
        const roleAccess = roleModules?.[module] || { view: false, create: false, edit: false, delete: false };

        // Role permissions override department defaults
        merged[module] = {
            view: roleAccess.view !== undefined ? roleAccess.view : deptAccess.view,
            create: roleAccess.create !== undefined ? roleAccess.create : deptAccess.create,
            edit: roleAccess.edit !== undefined ? roleAccess.edit : deptAccess.edit,
            delete: roleAccess.delete !== undefined ? roleAccess.delete : deptAccess.delete
        };
    });

    return merged;
};

/**
 * Merge financial permissions (user > role > department)
 */
const mergeFinancialPermissions = (deptPerms, rolePerms, userPerms) => {
    const merged = {};

    const allPerms = new Set([
        ...Object.keys(deptPerms || {}),
        ...Object.keys(rolePerms || {}),
        ...Object.keys(userPerms || {})
    ]);

    allPerms.forEach(perm => {
        // User-level has highest priority, then role, then department
        if (userPerms?.[perm] !== undefined) {
            merged[perm] = userPerms[perm];
        } else if (rolePerms?.[perm] !== undefined) {
            merged[perm] = rolePerms[perm];
        } else {
            merged[perm] = deptPerms?.[perm] || false;
        }
    });

    return merged;
};

/**
 * Check if user has permission for a specific module and action
 */
export const hasPermission = async (user, module, action) => {
    try {
        const permissions = await calculateUserPermissions(user);

        if (!permissions.moduleAccess[module]) {
            return false;
        }

        return permissions.moduleAccess[module][action] === true;
    } catch (error) {
        console.error('Permission check error:', error);
        return false;
    }
};

/**
 * Check if user has financial permission
 */
export const hasFinancialPermission = async (user, permission) => {
    try {
        const permissions = await calculateUserPermissions(user);
        return permissions.financialPermissions[permission] === true;
    } catch (error) {
        console.error('Financial permission check error:', error);
        return false;
    }
};

/**
 * Check if user has approval right
 */
export const hasApprovalRight = async (user, approvalType) => {
    try {
        const permissions = await calculateUserPermissions(user);
        return permissions.approvalRights[approvalType] === true;
    } catch (error) {
        console.error('Approval right check error:', error);
        return false;
    }
};

/**
 * Get data scope filter for queries
 * Returns MongoDB query filter based on user's data scope
 */
export const getDataScopeFilter = async (user, resourceOwnerId = 'assignedTo') => {
    const permissions = await calculateUserPermissions(user);
    const User = (await import('../models/User.js')).default;
    const cacheService = await import('./cache.service.js');

    switch (permissions.dataScope) {
        case 'assigned':
            // Only see own data
            return { [resourceOwnerId]: user._id };

        case 'team':
            // See own data + team members' data
            // Try cache first
            let teamIds = await cacheService.getCachedTeamMembers(user._id.toString());

            if (!teamIds) {
                const teamMembers = await User.find({ reportingTo: user._id }).select('_id');
                teamIds = [user._id, ...teamMembers.map(m => m._id)];
                await cacheService.cacheTeamMembers(user._id.toString(), teamIds);
            }

            return { [resourceOwnerId]: { $in: teamIds } };

        case 'department':
            // See all data in department
            // Try cache first
            let deptIds = await cacheService.getCachedDepartmentUsers(user.department);

            if (!deptIds) {
                const deptUsers = await User.find({ department: user.department }).select('_id');
                deptIds = deptUsers.map(u => u._id);
                await cacheService.cacheDepartmentUsers(user.department, deptIds);
            }

            return { [resourceOwnerId]: { $in: deptIds } };

        case 'all':
            // See all data
            return {};

        default:
            // Default to assigned only
            return { [resourceOwnerId]: user._id };
    }
};

/**
 * Apply location scope filter if applicable
 */
export const applyLocationScope = (user, baseFilter = {}) => {
    if (!user.locationScope) {
        return baseFilter;
    }

    const locationFilter = {};

    if (user.locationScope.districts && user.locationScope.districts.length > 0) {
        locationFilter.district = { $in: user.locationScope.districts };
    }

    if (user.locationScope.tehsils && user.locationScope.tehsils.length > 0) {
        locationFilter.tehsil = { $in: user.locationScope.tehsils };
    }

    if (user.locationScope.projects && user.locationScope.projects.length > 0) {
        locationFilter.projectId = { $in: user.locationScope.projects };
    }

    // Combine with base filter
    if (Object.keys(locationFilter).length > 0) {
        return { ...baseFilter, ...locationFilter };
    }

    return baseFilter;
};

/**
 * Check if user can access specific resource
 */
export const canAccessResource = async (user, resource, resourceOwnerId = 'assignedTo') => {
    const scopeFilter = await getDataScopeFilter(user, resourceOwnerId);

    // If filter is empty (all access), user can access
    if (Object.keys(scopeFilter).length === 0) {
        return true;
    }

    // Check if resource matches filter
    const ownerId = resource[resourceOwnerId];
    if (!ownerId) {
        return false;
    }

    // Handle array of IDs (for team/department scope)
    if (scopeFilter[resourceOwnerId]?.$in) {
        return scopeFilter[resourceOwnerId].$in.some(id =>
            id.toString() === ownerId.toString()
        );
    }

    // Handle single ID (for assigned scope)
    if (scopeFilter[resourceOwnerId]) {
        return scopeFilter[resourceOwnerId].toString() === ownerId.toString();
    }

    return false;
};

export default {
    calculateUserPermissions,
    hasPermission,
    hasFinancialPermission,
    hasApprovalRight,
    getDataScopeFilter,
    applyLocationScope,
    canAccessResource
};
