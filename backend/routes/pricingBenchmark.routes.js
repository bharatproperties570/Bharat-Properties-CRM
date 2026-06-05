/**
 * Pricing Benchmark Routes
 * Base path: /api/pricing
 */

import express from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import {
    aggregateBenchmarks,
    suggestPrice,
    getBenchmark,
    getMarketPulse,
    getDealPriceAnalysis,
} from '../controllers/pricingBenchmark.controller.js';

const router = express.Router();

// Apply authentication to all pricing routes
router.use(authenticate);

// POST /api/pricing/aggregate  → Run benchmark aggregation (admin/cron)
router.post('/aggregate', aggregateBenchmarks);

// GET  /api/pricing/suggest    → Price bands + orientation analysis for an inventory/deal
router.get('/suggest', suggestPrice);

// GET  /api/pricing/benchmark  → Get raw benchmark for location × subCategory
router.get('/benchmark', getBenchmark);

// GET  /api/pricing/market-pulse → Dashboard trending markets KPI
router.get('/market-pulse', getMarketPulse);

// GET  /api/pricing/deal-analysis/:dealId → Deal price journey
router.get('/deal-analysis/:dealId', getDealPriceAnalysis);

export default router;
