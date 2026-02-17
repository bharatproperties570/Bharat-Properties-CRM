/**
 * User Management Controller
 * Handles all user CRUD operations, permission management, and user actions
 */

import User from '../models/User.js';
import Role from '../models/Role.js';
import Session from '../models/Session.js';
import AuditLog from '../models/AuditLog.js';
import { validatePassword, calculatePasswordExpiry } from '../config/password.policy.js';
import { invalidateAllUserCaches } from '../services/cache.service.js';
import { calculateUserPermissions } from '../services/permission.service.js';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

/**
 * Get all users with filtering and pagination
 */
export const getUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            department,
            role,
            status,
            search,
            dataScope,
            reportingTo
        } = req.query;

        const query = {};

        // Apply filters
        if (department) query.department = department;
        if (role) query.role = role;
        if (status) query.status = status;
        if (dataScope) query.dataScope = dataScope;
        if (reportingTo) query.reportingTo = reportingTo;

        // Search by name or email
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            User.find(query)
                .populate('role', 'name department')
                .populate('reportingTo', 'fullName email')
                .select('-password -passwordHistory')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
};

/**
 * Get single user by ID
 */
export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id)
            .populate('role')
            .populate('reportingTo', 'fullName email department')
            .select('-password -passwordHistory');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get user's permissions
        const permissions = await calculateUserPermissions(user);

        // Get active sessions count
        const activeSessions = await Session.countDocuments({
            userId: id,
            isActive: true
        });

        res.status(200).json({
            success: true,
            data: {
                ...user.toObject(),
                permissions,
                activeSessions
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user',
            error: error.message
        });
    }
};

/**
 * Create new user
 */
export const createUser = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            fullName,
            email,
            mobile,
            username,
            password,
            department,
            role,
            reportingTo,
            dataScope,
            locationScope,
            financialPermissions
        } = req.body;

        // Validate password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Password does not meet policy requirements',
                errors: passwordValidation.errors
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Verify role exists and belongs to department
        const roleDoc = await Role.findById(role);
        if (!roleDoc) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        if (roleDoc.department !== department) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: `Role ${roleDoc.name} does not belong to ${department} department`
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = new User({
            fullName,
            email,
            mobile,
            username,
            password: hashedPassword,
            department,
            role,
            reportingTo,
            dataScope,
            locationScope,
            financialPermissions,
            passwordExpiresAt: calculatePasswordExpiry(),
            passwordHistory: [{ hash: hashedPassword, changedAt: new Date() }]
        });

        await user.save({ session });

        // Log audit event
        await AuditLog.create([{
            eventType: 'user_created',
            userId: user._id,
            userName: user.fullName,
            userEmail: user.email,
            actorId: req.user?._id,
            actorName: req.user?.fullName,
            actorEmail: req.user?.email,
            description: `User ${user.fullName} created`,
            metadata: {
                department,
                role: roleDoc.name,
                dataScope
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        }], { session });

        await session.commitTransaction();

        // Return user without sensitive data
        const userResponse = await User.findById(user._id)
            .populate('role', 'name department')
            .populate('reportingTo', 'fullName email')
            .select('-password -passwordHistory');

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: userResponse
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create user',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};

/**
 * Update user
 */
export const updateUser = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const updates = req.body;

        const user = await User.findById(id);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Handle password update
        if (updates.password) {
            const passwordValidation = validatePassword(updates.password);
            if (!passwordValidation.valid) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: 'Password does not meet policy requirements',
                    errors: passwordValidation.errors
                });
            }
            updates.password = await bcrypt.hash(updates.password, 10);
            updates.passwordHistory = [...user.passwordHistory, { hash: updates.password, changedAt: new Date() }];
        } else {
            // Prevent clearing password if sent as empty string/null
            delete updates.password;
        }

        // Store original values for audit
        const originalValues = {
            department: user.department,
            role: user.role,
            dataScope: user.dataScope,
            financialPermissions: user.financialPermissions,
            reportingTo: user.reportingTo
        };

        // If role is being changed, verify it belongs to department
        if (updates.role && updates.role !== user.role.toString()) {
            const roleDoc = await Role.findById(updates.role);
            if (!roleDoc) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role'
                });
            }

            const targetDept = updates.department || user.department;
            if (roleDoc.department !== targetDept) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Role ${roleDoc.name} does not belong to ${targetDept} department`
                });
            }
        }

        // Update user
        Object.assign(user, updates);
        await user.save({ session });

        // Invalidate caches
        await invalidateAllUserCaches(user._id, user.department, user.reportingTo);

        // Log audit event
        await AuditLog.create([{
            eventType: 'user_updated',
            userId: user._id,
            userName: user.fullName,
            userEmail: user.email,
            actorId: req.user?._id,
            actorName: req.user?.fullName,
            actorEmail: req.user?.email,
            description: `User ${user.fullName} updated`,
            changes: {
                before: originalValues,
                after: {
                    department: user.department,
                    role: user.role,
                    dataScope: user.dataScope,
                    financialPermissions: user.financialPermissions,
                    reportingTo: user.reportingTo
                }
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        }], { session });

        await session.commitTransaction();

        const updatedUser = await User.findById(id)
            .populate('role', 'name department')
            .populate('reportingTo', 'fullName email')
            .select('-password -passwordHistory');

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: updatedUser
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};

/**
 * Delete user (soft delete - deactivate)
 */
export const deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive: false, status: 'inactive' },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Toggle user status (activate/inactivate)
 */
export const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason, duration } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check permissions (Only Admin or Senior Role)
        // detailed permission check should be middleware, but adding basic check here
        // Assuming req.user is populated by auth middleware
        // For now, we trust the caller has permission or UI handles visibility

        if (status === 'inactive') {
            if (!reason) {
                return res.status(400).json({ success: false, message: 'Reason is required for inactivation' });
            }
            user.status = 'inactive';
            user.isActive = false;
            user.inactivationReason = reason;
            user.inactivatedBy = req.user?._id;

            if (duration && duration !== 'indefinite') {
                const now = new Date();
                if (duration === '1_day') now.setDate(now.getDate() + 1);
                else if (duration === '1_week') now.setDate(now.getDate() + 7);
                else if (duration === '1_month') now.setMonth(now.getMonth() + 1);
                else if (duration === 'custom' && req.body.customDate) now.setTime(new Date(req.body.customDate).getTime());

                user.inactiveUntil = now;
            } else {
                user.inactiveUntil = null;
            }
        } else {
            // Reactivating
            user.status = 'active';
            user.isActive = true;
            user.inactivationReason = null;
            user.inactiveUntil = null;
            user.inactivatedBy = null;
        }

        await user.save();

        // Invalidate caches
        await invalidateAllUserCaches(user._id, user.department, user.reportingTo);

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error('Toggle status error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Deactivate user with data transfer
 */
export const deactivateUser = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const { transferToUserId, reason } = req.body;

        if (!transferToUserId) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Transfer target user is required'
            });
        }

        const user = await User.findById(id);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const transferToUser = await User.findById(transferToUserId);
        if (!transferToUser) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Transfer target user not found'
            });
        }

        // Import models dynamically
        const Lead = (await import('../models/Lead.js')).default;
        const Deal = (await import('../models/Deal.js')).default;

        // Transfer data
        const [leadResult, dealResult] = await Promise.all([
            Lead.updateMany(
                { assignedTo: id },
                { $set: { assignedTo: transferToUserId } },
                { session }
            ),
            Deal.updateMany(
                { assignedTo: id },
                { $set: { assignedTo: transferToUserId } },
                { session }
            )
        ]);

        // Update reporting structure
        await User.updateMany(
            { reportingTo: id },
            { $set: { reportingTo: transferToUserId } },
            { session }
        );

        // Deactivate user
        user.isActive = false;
        user.status = 'inactive';
        await user.save({ session });

        // Force logout all sessions
        await Session.forceLogoutUser(id, req.user?._id, 'user_deactivated');

        // Invalidate caches
        await invalidateAllUserCaches(id, user.department, user.reportingTo);

        // Log audit event
        await AuditLog.create([{
            eventType: 'user_deactivated',
            userId: id,
            userName: user.fullName,
            userEmail: user.email,
            actorId: req.user?._id,
            actorName: req.user?.fullName,
            actorEmail: req.user?.email,
            description: `User ${user.fullName} deactivated and data transferred to ${transferToUser.fullName}`,
            metadata: {
                reason,
                transferred: {
                    leads: leadResult.modifiedCount,
                    deals: dealResult.modifiedCount
                },
                transferredTo: {
                    id: transferToUserId,
                    name: transferToUser.fullName
                }
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        }], { session });

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: 'User deactivated and data transferred successfully',
            data: {
                transferred: {
                    leads: leadResult.modifiedCount,
                    deals: dealResult.modifiedCount
                }
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Deactivate user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to deactivate user',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};

/**
 * Force logout user (all sessions)
 */
export const forceLogoutUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason = 'force_logout' } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const sessionCount = await Session.forceLogoutUser(id, req.user?._id, reason);

        // Log audit event
        await AuditLog.logUserEvent(
            'user_force_logout',
            id,
            req.user?._id,
            `All sessions (${sessionCount}) terminated for ${user.fullName}`,
            { reason, sessionCount }
        );

        res.status(200).json({
            success: true,
            message: `Successfully logged out ${sessionCount} session(s)`,
            data: { sessionCount }
        });
    } catch (error) {
        console.error('Force logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to force logout user',
            error: error.message
        });
    }
};

/**
 * Get user hierarchy (team structure)
 */
export const getUserHierarchy = async (req, res) => {
    try {
        const { department } = req.query;

        const query = department ? { department, isActive: true } : { isActive: true };

        const users = await User.find(query)
            .populate('role', 'name')
            .populate('reportingTo', 'fullName email')
            .select('fullName email department role reportingTo dataScope isActive');

        // Build hierarchy tree
        const buildTree = (users, parentId = null) => {
            return users
                .filter(user => {
                    const reportingToId = user.reportingTo?._id?.toString();
                    return parentId === null ? !reportingToId : reportingToId === parentId;
                })
                .map(user => ({
                    ...user.toObject(),
                    children: buildTree(users, user._id.toString())
                }));
        };

        const hierarchy = buildTree(users);

        res.status(200).json({
            success: true,
            data: hierarchy
        });
    } catch (error) {
        console.error('Get hierarchy error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user hierarchy',
            error: error.message
        });
    }
};

/**
 * Get user's team members
 */
export const getTeamMembers = async (req, res) => {
    try {
        const { id } = req.params;

        const teamMembers = await User.find({ reportingTo: id, status: 'active' })
            .populate('role', 'name department')
            .select('fullName email department role dataScope isActive');

        res.status(200).json({
            success: true,
            data: teamMembers
        });
    } catch (error) {
        console.error('Get team members error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch team members',
            error: error.message
        });
    }
};

/**
 * Get user's active sessions
 */
export const getUserSessions = async (req, res) => {
    try {
        const { id } = req.params;

        const sessions = await Session.getActiveSessions(id);

        res.status(200).json({
            success: true,
            data: sessions
        });
    } catch (error) {
        console.error('Get sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user sessions',
            error: error.message
        });
    }
};

/**
 * Get user's audit trail
 */
export const getUserAuditTrail = async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 50 } = req.query;

        const auditLogs = await AuditLog.getUserAuditTrail(id, parseInt(limit));

        res.status(200).json({
            success: true,
            data: auditLogs
        });
    } catch (error) {
        console.error('Get audit trail error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch audit trail',
            error: error.message
        });
    }
};

// Keep legacy import functions for backward compatibility
export const importUsers = async (req, res) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: 'Invalid data provided' });
        }

        const restructuredData = await Promise.all(data.map(async (item) => {
            if (!item.email || !item.name) {
                throw new Error('Email and Full Name are required');
            }

            // Set default password or use provided one
            const password = item.password || 'Welcome@123';
            const hashedPassword = await bcrypt.hash(password, 10);

            return {
                fullName: item.name,
                email: item.email,
                mobile: item.mobile,
                username: item.username || item.email.split('@')[0],
                password: hashedPassword,
                department: (item.department || 'sales').toLowerCase(),
                role: item.role,
                reportingTo: item.reportingTo || null,
                dataScope: (item.dataScope || 'assigned').toLowerCase(),

                // Financial Permissions (Nested object)
                financialPermissions: {
                    canViewMargin: item.canViewMargin === 'Yes' || item.canViewMargin === true,
                    canEditCommission: item.canEditCommission === 'Yes' || item.canEditCommission === true,
                    canOverrideCommission: item.canOverrideCommission === 'Yes' || item.canOverrideCommission === true,
                    canApproveDeal: item.canApproveDeal === 'Yes' || item.canApproveDeal === true,
                    canApprovePayment: item.canApprovePayment === 'Yes' || item.canApprovePayment === true,
                    canApprovePayout: item.canApprovePayout === 'Yes' || item.canApprovePayout === true
                },

                isActive: true,
                status: 'active',
                passwordExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
                passwordHistory: [{ hash: hashedPassword, changedAt: new Date() }]
            };
        }));

        await User.insertMany(restructuredData, { ordered: false });

        res.status(200).json({
            success: true,
            message: `Successfully imported ${restructuredData.length} users.`
        });
    } catch (error) {
        if (error.writeErrors) {
            const realSuccessCount = req.body.data.length - error.writeErrors.length;
            return res.status(200).json({
                success: true,
                message: `Imported ${realSuccessCount} users. ${error.writeErrors.length} failed.`,
                successCount: realSuccessCount,
                errorCount: error.writeErrors.length,
                errors: error.writeErrors.map(e => ({ item: e.errmsg, error: 'Duplicate or Validation Error' }))
            });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

export const checkDuplicatesImport = async (req, res) => {
    try {
        const { emails } = req.body;
        if (!emails || !Array.isArray(emails)) {
            return res.status(400).json({ success: false, error: 'Invalid emails provided' });
        }

        const duplicates = await User.find({ email: { $in: emails } }, 'email fullName').lean();
        const existingEmails = duplicates.map(d => d.email);
        const matchedEmails = emails.filter(e => existingEmails.includes(e));
        const uniqueMatched = [...new Set(matchedEmails)];

        res.status(200).json({
            success: true,
            duplicates: uniqueMatched,
            details: duplicates.map(d => ({
                id: d._id,
                name: d.fullName,
                email: d.email
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export default {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    deactivateUser,
    forceLogoutUser,
    getUserHierarchy,
    getTeamMembers,
    getUserSessions,
    getUserAuditTrail,
    importUsers,
    checkDuplicatesImport,
    toggleUserStatus
};
