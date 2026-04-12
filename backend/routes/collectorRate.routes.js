import express from 'express';
import {
    createCollectorRate,
    getAllCollectorRates,
    updateCollectorRate,
    deleteCollectorRate
} from '../controllers/collectorRate.controller.js';
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Base path: /api/collector-rates

router.post('/', createCollectorRate);
router.get('/', getAllCollectorRates);
router.put('/:id', updateCollectorRate);
router.delete('/:id', deleteCollectorRate);

export default router;
