import express from "express";
import {
    getScoringRules,
    calculateLeadScore,
    createScoringRule,
    updateScoringRule,
    deleteScoringRule
} from "./scoring.controller.js";

const router = express.Router();

router.get("/", getScoringRules);
router.post("/calculate", calculateLeadScore);
router.post("/", createScoringRule);
router.put("/:id", updateScoringRule);
router.delete("/:id", deleteScoringRule);

export default router;
