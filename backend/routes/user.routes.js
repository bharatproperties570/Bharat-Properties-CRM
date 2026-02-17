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

const router = express.Router();

// List and create users
router.get('/', getUsers);
router.post('/', createUser);

// Bulk operations
router.post('/import', importUsers);
router.post('/check-duplicates', checkDuplicatesImport);

// Hierarchy and team
router.get('/hierarchy', getUserHierarchy);

// Single user operations
router.route('/:id')
    .get(getUserById)
    .put(updateUser)
    .delete(deleteUser);

// User actions
router.post('/:id/deactivate', deactivateUser);
router.post('/:id/force-logout', forceLogoutUser);
router.post('/:id/status', toggleUserStatus);

// User relationships
router.get('/:id/team', getTeamMembers);
router.get('/:id/sessions', getUserSessions);
router.get('/:id/audit-trail', getUserAuditTrail);

export default router;
