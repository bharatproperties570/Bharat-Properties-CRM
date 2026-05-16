import express from 'express';
import { getConfigs, createConfig, updateConfig, deleteConfig, triggerConfig } from './discovery.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize(['Admin', 'SuperAdmin']));

router.get('/', getConfigs);
router.post('/', createConfig);
router.put('/:id', updateConfig);
router.delete('/:id', deleteConfig);
router.post('/:id/trigger', triggerConfig);

export default router;
