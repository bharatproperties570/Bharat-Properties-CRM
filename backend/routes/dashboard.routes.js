import express from "express";
import { getDashboardStats, getAIIntelligenceStats } from "../controllers/dashboard.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/stats", protect, getDashboardStats);
router.get("/ai-intelligence", protect, getAIIntelligenceStats);

export default router;
