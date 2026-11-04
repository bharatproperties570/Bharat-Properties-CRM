import express from 'express';
import { getConfigs, createConfig, updateConfig, deleteConfig, triggerConfig } from './discovery.controller.js';
import { approveDomain, revokeDomain, listDomains, getDomainDetails } from './domainGovernance.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Domain Governance Routes (Finding B: RBAC & Durable Audit)
// Operator RBAC: Only Admin and SuperAdmin can approve or revoke domains
router.post('/domains/approve', authorize('Admin', 'SuperAdmin'), approveDomain);
router.post('/domains/revoke', authorize('Admin', 'SuperAdmin'), revokeDomain);
router.get('/domains', authorize('Admin', 'SuperAdmin', 'Manager'), listDomains);
router.get('/domains/:domain', authorize('Admin', 'SuperAdmin', 'Manager'), getDomainDetails);

// Config Management Routes (Admin, SuperAdmin, Manager)
router.get('/', authorize('Admin', 'SuperAdmin', 'Manager'), getConfigs);
router.post('/', authorize('Admin', 'SuperAdmin', 'Manager'), createConfig);
router.put('/:id', authorize('Admin', 'SuperAdmin', 'Manager'), updateConfig);
router.delete('/:id', authorize('Admin', 'SuperAdmin', 'Manager'), deleteConfig);
router.post('/:id/trigger', authorize('Admin', 'SuperAdmin', 'Manager'), triggerConfig);

export default router;
