import express from "express";
import { getDistributionRules, createDistributionRule, updateDistributionRule, deleteDistributionRule } from "../controllers/distributionRule.controller.js";

const router = express.Router();

router.get("/", getDistributionRules);
router.post("/", createDistributionRule);
router.put("/:id", updateDistributionRule);
router.delete("/:id", deleteDistributionRule);
router.get("/entity/:entity", getDistributionRules); // Alias for filtering

export default router;
