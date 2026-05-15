import express from 'express';
import { createPortfolio, getPublicPortfolio } from '../controllers/portfolio.controller.js';
import { authenticate } from '../src/middlewares/auth.middleware.js';

const router = express.Router();

// Public Route (Lead views the portfolio)
router.get("/public/:token", getPublicPortfolio);

// Private Routes (Agent manages portfolios)
router.use(authenticate);
router.post("/", createPortfolio);

export default router;
