import express from 'express';
const router = express.Router();
import { calculateValuation } from '../controllers/valuation.controller.js';

// Base path: /api/valuation

router.post('/calculate', calculateValuation);

export default router;
