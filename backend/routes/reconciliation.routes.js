import express from 'express';
import {
    getSummary,
    getGroups,
    getGroupById,
    generatePlan,
    approveGroup,
    rejectGroup,
    executeGroup,
    disassociatePhone,
    rollbackGroup,
    getMigrationReadiness,
    syncGroups
} from '../controllers/reconciliation.controller.js';
import { authenticate, authorize } from '../src/middlewares/auth.middleware.js';
import { checkPermission } from '../middlewares/permission.middleware.js';

const router = express.Router();

// Strict Authentication across all reconciliation endpoints
router.use(authenticate);

// Global baseline: minimum manager role required to access reconciliation module
router.use(authorize('admin', 'super admin', 'manager'));

// Read Endpoints (Protected by contacts.view permission)
router.get('/summary', checkPermission('contacts', 'view'), getSummary);
router.get('/groups', checkPermission('contacts', 'view'), getGroups);
router.get('/groups/:id', checkPermission('contacts', 'view'), getGroupById);
router.get('/migration-readiness', checkPermission('contacts', 'view'), getMigrationReadiness);

// Dry-Run Plan (Read-only simulation protected by contacts.view)
router.post('/groups/:id/plan', checkPermission('contacts', 'view'), generatePlan);

// Operational Reviews (Protected by contacts.edit permission)
router.post('/groups/:id/approve', checkPermission('contacts', 'edit'), approveGroup);
router.post('/groups/:id/reject', checkPermission('contacts', 'edit'), rejectGroup);

// Elevated Mutations (Protected by contacts.edit + RBAC enforcement)
router.post('/groups/:id/execute', checkPermission('contacts', 'edit'), executeGroup);
router.post('/groups/:id/disassociate-phone', checkPermission('contacts', 'edit'), disassociatePhone);
router.post('/groups/:id/rollback', checkPermission('contacts', 'edit'), rollbackGroup);
router.post('/sync', authorize('admin', 'super admin'), checkPermission('contacts', 'edit'), syncGroups);

export default router;
