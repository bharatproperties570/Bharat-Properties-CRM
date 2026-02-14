import express from 'express';
const router = express.Router();
import {
    createCollectorRate,
    getAllCollectorRates,
    updateCollectorRate,
    deleteCollectorRate
} from '../controllers/collectorRate.controller.js';

// Base path: /api/collector-rates

router.post('/', createCollectorRate);
router.get('/', getAllCollectorRates);
router.put('/:id', updateCollectorRate);
router.delete('/:id', deleteCollectorRate);

export default router;
