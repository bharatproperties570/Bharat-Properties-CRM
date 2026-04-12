import express from 'express';
import { calculateValuation } from '../controllers/valuation.controller.js';
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Base path: /api/valuation

router.post('/calculate', calculateValuation);

export default router;
