import express from 'express';
import { getHealth, getFailedTransitions, dryRunTest } from '../controllers/stageEngine.controller.js';
import { authenticate } from '../src/middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication. In a real scenario, restrict to Admins.
router.use(authenticate);

router.get('/health', getHealth);
router.get('/failed', getFailedTransitions);
router.post('/test', dryRunTest);

export default router;
