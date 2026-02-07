import express from "express";
import {
    getDistributionRulesByEntity,
    getAllDistributionRules,
    createDistributionRule,
    updateDistributionRule,
    deleteDistributionRule
} from "./distribution.controller.js";

const router = express.Router();

router.get("/", getAllDistributionRules);
router.get("/:entity", getDistributionRulesByEntity);
router.post("/", createDistributionRule);
router.put("/:id", updateDistributionRule);
router.delete("/:id", deleteDistributionRule);

export default router;
