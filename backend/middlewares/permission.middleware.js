/**
 * Permission Middleware
 * Protects API routes with permission checks
 */

import AuditLog from '../models/AuditLog.js';
import { hasPermission, hasFinancialPermission, hasApprovalRight } from '../services/permission.service.js';

/**
 * Middleware to check if user has permission for a module and action
 * Usage: checkPermission('leads', 'create')
 */
export const checkPermission = (module, action) => {
    return async (req, res, next) => {
        try {
            // Get user from request (assumes auth middleware has set req.user)
            const user = req.user;

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // Check permission
            const allowed = await hasPermission(user, module, action);

            if (!allowed) {
                // Log unauthorized access attempt
                await AuditLog.create({
                    eventType: 'access_denied',
                    userId: user._id,
                    userName: user.fullName,
                    userEmail: user.email,
                    description: `Access denied: ${action} on ${module}`,
                    metadata: {
                        module,
                        action,
                        url: req.originalUrl,
                        method: req.method
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                    requestUrl: req.originalUrl,
                    requestMethod: req.method,
                    status: 'failure'
                });

                return res.status(403).json({
                    success: false,
                    message: `Insufficient permissions: Cannot ${action} ${module}`
                });
            }

            // Permission granted, proceed
            next();
        } catch (error) {
            console.error('Permission check error:', error);
            return res.status(500).json({
                success: false,
                message: 'Permission check failed',
                error: error.message
            });
        }
    };
};

/**
 * Middleware to check financial permission
 * Usage: checkFinancialPermission('canViewMargin')
 */
export const checkFinancialPermission = (permission) => {
    return async (req, res, next) => {
        try {
            const user = req.user;

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const allowed = await hasFinancialPermission(user, permission);

            if (!allowed) {
                await AuditLog.create({
                    eventType: 'access_denied',
                    userId: user._id,
                    userName: user.fullName,
                    userEmail: user.email,
                    description: `Financial permission denied: ${permission}`,
                    metadata: {
                        permission,
                        url: req.originalUrl,
                        method: req.method
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                    requestUrl: req.originalUrl,
                    requestMethod: req.method,
                    status: 'failure'
                });

                return res.status(403).json({
                    success: false,
                    message: `Insufficient financial permissions: ${permission}`
                });
            }

            next();
        } catch (error) {
            console.error('Financial permission check error:', error);
            return res.status(500).json({
                success: false,
                message: 'Financial permission check failed',
                error: error.message
            });
        }
    };
};

/**
 * Middleware to check approval right
 * Usage: checkApprovalRight('approveDeal')
 */
export const checkApprovalRight = (approvalType) => {
    return async (req, res, next) => {
        try {
            const user = req.user;

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const allowed = await hasApprovalRight(user, approvalType);

            if (!allowed) {
                await AuditLog.create({
                    eventType: 'access_denied',
                    userId: user._id,
                    userName: user.fullName,
                    userEmail: user.email,
                    description: `Approval right denied: ${approvalType}`,
                    metadata: {
                        approvalType,
                        url: req.originalUrl,
                        method: req.method
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                    requestUrl: req.originalUrl,
                    requestMethod: req.method,
                    status: 'failure'
                });

                return res.status(403).json({
                    success: false,
                    message: `Insufficient approval rights: ${approvalType}`
                });
            }

            next();
        } catch (error) {
            console.error('Approval right check error:', error);
            return res.status(500).json({
                success: false,
                message: 'Approval right check failed',
                error: error.message
            });
        }
    };
};

/**
 * Middleware to check department access
 * Usage: checkDepartment('sales', 'marketing')
 */
export const checkDepartment = (...allowedDepartments) => {
    return async (req, res, next) => {
        try {
            const user = req.user;

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            if (!allowedDepartments.includes(user.department)) {
                await AuditLog.create({
                    eventType: 'access_denied',
                    userId: user._id,
                    userName: user.fullName,
                    userEmail: user.email,
                    description: `Department access denied. Required: ${allowedDepartments.join(', ')}, User has: ${user.department}`,
                    metadata: {
                        allowedDepartments,
                        userDepartment: user.department,
                        url: req.originalUrl,
                        method: req.method
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                    requestUrl: req.originalUrl,
                    requestMethod: req.method,
                    status: 'failure'
                });

                return res.status(403).json({
                    success: false,
                    message: `Access restricted to ${allowedDepartments.join(', ')} department(s)`
                });
            }

            next();
        } catch (error) {
            console.error('Department check error:', error);
            return res.status(500).json({
                success: false,
                message: 'Department check failed',
                error: error.message
            });
        }
    };
};

/**
 * Middleware to require active user status
 */
export const requireActive = async (req, res, next) => {
    try {
        const user = req.user;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!user.isActive || user.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: 'Account is inactive or suspended'
            });
        }

        next();
    } catch (error) {
        console.error('Active status check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Status check failed',
            error: error.message
        });
    }
};

/**
 * Combined middleware for common permission patterns
 */
export const requirePermission = {
    // Leads
    viewLeads: checkPermission('leads', 'view'),
    createLead: checkPermission('leads', 'create'),
    editLead: checkPermission('leads', 'edit'),
    deleteLead: checkPermission('leads', 'delete'),

    // Deals
    viewDeals: checkPermission('deals', 'view'),
    createDeal: checkPermission('deals', 'create'),
    editDeal: checkPermission('deals', 'edit'),
    deleteDeal: checkPermission('deals', 'delete'),

    // Contacts
    viewContacts: checkPermission('contacts', 'view'),
    createContact: checkPermission('contacts', 'create'),
    editContact: checkPermission('contacts', 'edit'),
    deleteContact: checkPermission('contacts', 'delete'),

    // Inventory
    viewInventory: checkPermission('inventory', 'view'),
    createInventory: checkPermission('inventory', 'create'),
    editInventory: checkPermission('inventory', 'edit'),
    deleteInventory: checkPermission('inventory', 'delete'),

    // Payments
    viewPayments: checkPermission('payments', 'view'),
    createPayment: checkPermission('payments', 'create'),
    editPayment: checkPermission('payments', 'edit'),
    deletePayment: checkPermission('payments', 'delete'),

    // Commission
    viewCommission: checkPermission('commission', 'view'),
    editCommission: checkPermission('commission', 'edit'),

    // Financial
    viewMargin: checkFinancialPermission('canViewMargin'),
    editCommissionAmount: checkFinancialPermission('canEditCommission'),
    overrideCommission: checkFinancialPermission('canOverrideCommission'),
    approvePayment: checkFinancialPermission('canApprovePayment'),
    approvePayout: checkFinancialPermission('canApprovePayout'),

    // Approvals
    approveDeal: checkApprovalRight('approveDeal'),
    approveDiscount: checkApprovalRight('approveDiscount'),
    approveStageChange: checkApprovalRight('approveStageChange'),
    approveListingPublish: checkApprovalRight('approveListingPublish'),

    // Department-specific
    salesOnly: checkDepartment('sales'),
    marketingOnly: checkDepartment('marketing'),
    inventoryOnly: checkDepartment('inventory'),
    accountsOnly: checkDepartment('accounts'),
    salesOrAccounts: checkDepartment('sales', 'accounts')
};

export default {
    checkPermission,
    checkFinancialPermission,
    checkApprovalRight,
    checkDepartment,
    requireActive,
    requirePermission
};
