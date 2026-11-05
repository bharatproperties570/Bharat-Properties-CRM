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

const router = express.Router();

// Apply authentication and manager/admin authorization across all reconciliation routes
router.use(authenticate);
router.use(authorize('admin', 'super admin', 'manager'));

router.get('/summary', getSummary);
router.get('/groups', getGroups);
router.get('/groups/:id', getGroupById);
router.post('/groups/:id/plan', generatePlan);
router.post('/groups/:id/approve', approveGroup);
router.post('/groups/:id/reject', rejectGroup);
router.post('/groups/:id/execute', executeGroup);
router.post('/groups/:id/disassociate-phone', disassociatePhone);
router.post('/groups/:id/rollback', rollbackGroup);
router.get('/migration-readiness', getMigrationReadiness);
router.post('/sync', syncGroups);

export default router;
