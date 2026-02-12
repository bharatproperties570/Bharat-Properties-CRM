/**
 * Role Management Controller
 * Handles role CRUD operations and role-based queries
 */

import Role from '../models/Role.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { ROLE_TEMPLATES } from '../config/roles.config.js';
import { invalidateAllRoleCaches, invalidateUserPermissionCache } from '../services/cache.service.js';
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
    const session = await mongoose.startSession();
    session.startTransaction();

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

        // Check if role name already exists in this department
        const existingRole = await Role.findOne({ name, department });
        if (existingRole) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: `Role "${name}" already exists in ${department} department`
            });
        }

        // Create role
        const role = new Role({
            name,
            department,
            description,
            moduleAccess,
            defaultDataScope,
            financialPermissions,
            approvalRights,
            isSystemRole: false
        });

        await role.save({ session });

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
                targetId: role._id,
                targetName: role.name,
                description: `Role "${role.name}" created for ${department} department`,
                metadata: {
                    department,
                    defaultDataScope
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }], { session });
        }

        await session.commitTransaction();

        res.status(201).json({
            success: true,
            message: 'Role created successfully',
            data: role
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Create role error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create role',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};

/**
 * Update role
 */
export const updateRole = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const updates = req.body;

        const role = await Role.findById(id);
        if (!role) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Prevent editing system roles
        if (role.isSystemRole) {
            await session.abortTransaction();
            return res.status(403).json({
                success: false,
                message: 'System roles cannot be modified. Create a custom role instead.'
            });
        }

        // Store original values for audit
        const originalValues = {
            moduleAccess: role.moduleAccess,
            financialPermissions: role.financialPermissions,
            approvalRights: role.approvalRights,
            defaultDataScope: role.defaultDataScope
        };

        // Update role
        Object.assign(role, updates);
        await role.save({ session });

        // Invalidate caches for all users with this role
        await invalidateAllRoleCaches(id);

        // Get all users with this role and invalidate their permission caches
        const usersWithRole = await User.find({ role: id }).select('_id');
        for (const user of usersWithRole) {
            await invalidateUserPermissionCache(user._id);
        }

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
                targetId: role._id,
                targetName: role.name,
                description: `Role "${role.name}" updated`,
                changes: {
                    before: originalValues,
                    after: {
                        moduleAccess: role.moduleAccess,
                        financialPermissions: role.financialPermissions,
                        approvalRights: role.approvalRights,
                        defaultDataScope: role.defaultDataScope
                    }
                },
                metadata: {
                    affectedUsers: usersWithRole.length
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }], { session });
        }

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: 'Role updated successfully',
            data: role
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Update role error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update role',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};

/**
 * Delete role
 */
export const deleteRole = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        const role = await Role.findById(id);
        if (!role) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Prevent deleting system roles
        if (role.isSystemRole) {
            await session.abortTransaction();
            return res.status(403).json({
                success: false,
                message: 'System roles cannot be deleted'
            });
        }

        // Check if any users have this role
        const userCount = await User.countDocuments({ role: id });
        if (userCount > 0) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: `Cannot delete role. ${userCount} user(s) are assigned to this role.`,
                data: { userCount }
            });
        }

        await Role.findByIdAndDelete(id, { session });

        // Invalidate role cache
        await invalidateAllRoleCaches(id);

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

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: 'Role deleted successfully'
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Delete role error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete role',
            error: error.message
        });
    } finally {
        session.endSession();
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
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { sourceRoleId, newName, newDescription } = req.body;

        if (!sourceRoleId || !newName) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Source role ID and new name are required'
            });
        }

        const sourceRole = await Role.findById(sourceRoleId);
        if (!sourceRole) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Source role not found'
            });
        }

        // Check if new name already exists in department
        const existingRole = await Role.findOne({
            name: newName,
            department: sourceRole.department
        });

        if (existingRole) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: `Role "${newName}" already exists in ${sourceRole.department} department`
            });
        }

        // Clone role
        const clonedRole = new Role({
            name: newName,
            department: sourceRole.department,
            description: newDescription || sourceRole.description,
            moduleAccess: JSON.parse(JSON.stringify(sourceRole.moduleAccess)),
            defaultDataScope: sourceRole.defaultDataScope,
            financialPermissions: JSON.parse(JSON.stringify(sourceRole.financialPermissions)),
            approvalRights: JSON.parse(JSON.stringify(sourceRole.approvalRights)),
            isSystemRole: false
        });

        await clonedRole.save({ session });

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
                targetId: clonedRole._id,
                targetName: clonedRole.name,
                description: `Role "${clonedRole.name}" created by cloning "${sourceRole.name}"`,
                metadata: {
                    sourceRoleId,
                    sourceRoleName: sourceRole.name
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }], { session });
        }

        await session.commitTransaction();

        res.status(201).json({
            success: true,
            message: 'Role cloned successfully',
            data: clonedRole
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Clone role error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clone role',
            error: error.message
        });
    } finally {
        session.endSession();
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
