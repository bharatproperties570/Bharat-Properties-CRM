/**
 * Role Management Controller
 * Handles role CRUD operations and role-based queries
 */

import Role from '../models/Role.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { ROLE_TEMPLATES } from '../config/roles.config.js';
import { invalidateAllRoleCaches, invalidateUserPermissionCache } from '../services/cache.service.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';
import mongoose from 'mongoose';

/**
 * Get all roles with filtering
 */
export const getRoles = async (req, res) => {
    try {
        const { department, isSystemRole } = req.query;

        const query = {};
        if (department) query.department = department;
        if (isSystemRole !== undefined) query.isSystemRole = isSystemRole === 'true';

        const roles = await Role.find(query).sort({ department: 1, isSystemRole: -1, name: 1 });

        res.status(200).json({
            success: true,
            data: roles
        });
    } catch (error) {
        console.error('Get roles error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch roles',
            error: error.message
        });
    }
};

/**
 * Get single role by ID
 */
export const getRoleById = async (req, res) => {
    try {
        const { id } = req.params;

        const role = await Role.findById(id);

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Get user count for this role
        const userCount = await User.countDocuments({ role: id });

        res.status(200).json({
            success: true,
            data: {
                ...role.toObject(),
                userCount
            }
        });
    } catch (error) {
        console.error('Get role error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch role',
            error: error.message
        });
    }
};

/**
 * Create new role
 */
export const createRole = async (req, res) => {
    try {
        const {
            name,
            department,
            description,
            moduleAccess,
            defaultDataScope,
            financialPermissions,
            approvalRights
        } = req.body;

        const role = await withMongoTransaction(async (session) => {
            // Check if role name already exists in this department
            const existingRole = await Role.findOne({ name, department }).session(session);
            if (existingRole) {
                const err = new Error(`Role "${name}" already exists in ${department} department`);
                err.statusCode = 400;
                throw err;
            }

            // Create role
            const newRole = new Role({
                name,
                department,
                description,
                moduleAccess,
                defaultDataScope,
                financialPermissions,
                approvalRights,
                isSystemRole: false
            });

            await newRole.save({ session });

            // Log audit event (only if user is authenticated)
            if (req.user?._id) {
                await AuditLog.create([{
                    eventType: 'role_created',
                    userId: req.user._id,
                    userName: req.user.fullName,
                    userEmail: req.user.email,
                    actorId: req.user._id,
                    actorName: req.user.fullName,
                    actorEmail: req.user.email,
                    targetType: 'role',
                    targetId: newRole._id,
                    targetName: newRole.name,
                    description: `Role "${newRole.name}" created for ${department} department`,
                    metadata: {
                        department,
                        defaultDataScope
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent')
                }], { session });
            }

            return newRole;
        });

        res.status(201).json({
            success: true,
            message: 'Role created successfully',
            data: role
        });
    } catch (error) {
        console.error('Create role error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to create role',
            error: error.message
        });
    }
};

/**
 * Update role
 */
export const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        let usersWithRole = [];

        const role = await withMongoTransaction(async (session) => {
            const existingRole = await Role.findById(id).session(session);
            if (!existingRole) {
                const err = new Error('Role not found');
                err.statusCode = 404;
                throw err;
            }

            // Prevent editing system roles
            if (existingRole.isSystemRole) {
                const err = new Error('System roles cannot be modified. Create a custom role instead.');
                err.statusCode = 403;
                throw err;
            }

            // Store original values for audit
            const originalValues = {
                moduleAccess: existingRole.moduleAccess,
                financialPermissions: existingRole.financialPermissions,
                approvalRights: existingRole.approvalRights,
                defaultDataScope: existingRole.defaultDataScope
            };

            // Update role and increment permissionsVersion within transaction
            Object.assign(existingRole, updates);
            existingRole.permissionsVersion = (Number(existingRole.permissionsVersion) || 1) + 1;
            await existingRole.save({ session });

            // Find affected users for audit and post-commit cache invalidation
            usersWithRole = await User.find({ role: id }).select('_id').session(session);

            // Log audit event (only if user is authenticated)
            if (req.user?._id) {
                await AuditLog.create([{
                    eventType: 'role_updated',
                    userId: req.user._id,
                    userName: req.user.fullName,
                    userEmail: req.user.email,
                    actorId: req.user._id,
                    actorName: req.user.fullName,
                    actorEmail: req.user.email,
                    targetType: 'role',
                    targetId: existingRole._id,
                    targetName: existingRole.name,
                    description: `Role "${existingRole.name}" updated`,
                    changes: {
                        before: originalValues,
                        after: {
                            moduleAccess: existingRole.moduleAccess,
                            financialPermissions: existingRole.financialPermissions,
                            approvalRights: existingRole.approvalRights,
                            defaultDataScope: existingRole.defaultDataScope,
                            permissionsVersion: existingRole.permissionsVersion
                        }
                    },
                    metadata: {
                        affectedUsers: usersWithRole.length,
                        permissionsVersion: existingRole.permissionsVersion
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent')
                }], { session });
            }

            return existingRole;
        });

        // P1-B: Invalidate caches AFTER successful transaction commit so concurrent checks cannot repopulate stale state
        let cacheInvalidationWarning = null;
        try {
            await invalidateAllRoleCaches(id);
            for (const user of usersWithRole) {
                await invalidateUserPermissionCache(user._id);
            }
        } catch (cacheErr) {
            console.error('Post-commit cache invalidation error:', cacheErr);
            cacheInvalidationWarning = `Post-commit cache invalidation failed: ${cacheErr.message}`;
        }

        res.status(200).json({
            success: true,
            message: 'Role updated successfully',
            data: role,
            ...(cacheInvalidationWarning ? { warning: cacheInvalidationWarning } : {})
        });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to update role',
            error: error.message
        });
    }
};

/**
 * Delete role
 */
export const deleteRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { force } = req.query;

        await withMongoTransaction(async (session) => {
            const role = await Role.findById(id).session(session);
            if (!role) {
                const err = new Error('Role not found');
                err.statusCode = 404;
                throw err;
            }

            // Prevent deleting system roles
            if (role.isSystemRole) {
                const err = new Error('System roles cannot be deleted');
                err.statusCode = 403;
                throw err;
            }

            // Check if any active users have this role
            const userCount = await User.countDocuments({ role: id, status: 'active' }).session(session);

            if (userCount > 0 && force !== 'true') {
                const err = new Error(`Cannot delete role. ${userCount} user(s) are assigned to this role.`);
                err.statusCode = 400;
                err.isWarning = true;
                err.data = { userCount };
                throw err;
            }

            await Role.findByIdAndDelete(id, { session });

            // Log audit event (only if user is authenticated)
            if (req.user?._id) {
                await AuditLog.create([{
                    eventType: 'role_deleted',
                    userId: req.user._id,
                    userName: req.user.fullName,
                    userEmail: req.user.email,
                    actorId: req.user._id,
                    actorName: req.user.fullName,
                    actorEmail: req.user.email,
                    targetType: 'role',
                    targetId: id,
                    targetName: role.name,
                    description: `Role "${role.name}" deleted`,
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent')
                }], { session });
            }
        });

        // P1-B: Invalidate role cache AFTER successful commit
        try {
            await invalidateAllRoleCaches(id);
        } catch (cacheErr) {
            console.error('Post-commit role cache invalidation error:', cacheErr);
        }

        res.status(200).json({
            success: true,
            message: 'Role deleted successfully'
        });
    } catch (error) {
        console.error('Delete role error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to delete role',
            isWarning: error.isWarning || false,
            ...(error.data ? { data: error.data } : {}),
            error: error.message
        });
    }
};

/**
 * Get role templates
 */
export const getRoleTemplates = async (req, res) => {
    try {
        const { department } = req.query;

        let templates = Object.values(ROLE_TEMPLATES);

        if (department) {
            templates = templates.filter(t => t.department === department);
        }

        res.status(200).json({
            success: true,
            data: templates
        });
    } catch (error) {
        console.error('Get role templates error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch role templates',
            error: error.message
        });
    }
};

/**
 * Clone role from template or existing role
 */
export const cloneRole = async (req, res) => {
    try {
        const { sourceRoleId, newName, newDescription } = req.body;

        if (!sourceRoleId || !newName) {
            return res.status(400).json({
                success: false,
                message: 'Source role ID and new name are required'
            });
        }

        const clonedRole = await withMongoTransaction(async (session) => {
            const sourceRole = await Role.findById(sourceRoleId).session(session);
            if (!sourceRole) {
                const err = new Error('Source role not found');
                err.statusCode = 404;
                throw err;
            }

            // Check if new name already exists in department
            const existingRole = await Role.findOne({
                name: newName,
                department: sourceRole.department
            }).session(session);

            if (existingRole) {
                const err = new Error(`Role "${newName}" already exists in ${sourceRole.department} department`);
                err.statusCode = 400;
                throw err;
            }

            // Clone role
            const newClonedRole = new Role({
                name: newName,
                department: sourceRole.department,
                description: newDescription || sourceRole.description,
                moduleAccess: JSON.parse(JSON.stringify(sourceRole.moduleAccess)),
                defaultDataScope: sourceRole.defaultDataScope,
                financialPermissions: JSON.parse(JSON.stringify(sourceRole.financialPermissions)),
                approvalRights: JSON.parse(JSON.stringify(sourceRole.approvalRights)),
                isSystemRole: false
            });

            await newClonedRole.save({ session });

            // Log audit event (only if user is authenticated)
            if (req.user?._id) {
                await AuditLog.create([{
                    eventType: 'role_created',
                    userId: req.user._id,
                    userName: req.user.fullName,
                    userEmail: req.user.email,
                    actorId: req.user._id,
                    actorName: req.user.fullName,
                    actorEmail: req.user.email,
                    targetType: 'role',
                    targetId: newClonedRole._id,
                    targetName: newClonedRole.name,
                    description: `Role "${newClonedRole.name}" created by cloning "${sourceRole.name}"`,
                    metadata: {
                        sourceRoleId,
                        sourceRoleName: sourceRole.name
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent')
                }], { session });
            }

            return newClonedRole;
        });

        res.status(201).json({
            success: true,
            message: 'Role cloned successfully',
            data: clonedRole
        });
    } catch (error) {
        console.error('Clone role error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to clone role',
            error: error.message
        });
    }
};

/**
 * Get users assigned to a role
 */
export const getRoleUsers = async (req, res) => {
    try {
        const { id } = req.params;

        const role = await Role.findById(id);
        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        const users = await User.find({ role: id })
            .select('fullName email department dataScope isActive')
            .populate('reportingTo', 'fullName email');

        res.status(200).json({
            success: true,
            data: {
                role: {
                    id: role._id,
                    name: role.name,
                    department: role.department
                },
                users
            }
        });
    } catch (error) {
        console.error('Get role users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch role users',
            error: error.message
        });
    }
};

export default {
    getRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole,
    getRoleTemplates,
    cloneRole,
    getRoleUsers
};
