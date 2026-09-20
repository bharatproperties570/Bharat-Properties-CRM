import express from 'express';
import {
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
} from '../controllers/user.controller.js';
import { authenticate, authorize } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// List and create users
router.get('/', getUsers);
router.post('/', authorize('super admin', 'admin'), createUser);

// Bulk operations
router.post('/import', authorize('super admin', 'admin'), importUsers);
router.post('/check-duplicates', authorize('super admin', 'admin'), checkDuplicatesImport);

// Hierarchy and team
router.get('/hierarchy', getUserHierarchy);

// Single user operations
router.route('/:id')
    .get(getUserById)
    .put(authorize('super admin', 'admin'), updateUser)
    .delete(authorize('super admin', 'admin'), deleteUser);

// User actions
router.post('/:id/deactivate', authorize('super admin', 'admin'), deactivateUser);
router.post('/:id/force-logout', authorize('super admin', 'admin'), forceLogoutUser);
router.post('/:id/status', authorize('super admin', 'admin'), toggleUserStatus);

// User relationships
router.get('/:id/team', getTeamMembers);
router.get('/:id/sessions', authorize('super admin', 'admin'), getUserSessions);
router.get('/:id/audit-trail', authorize('super admin', 'admin'), getUserAuditTrail);

export default router;
