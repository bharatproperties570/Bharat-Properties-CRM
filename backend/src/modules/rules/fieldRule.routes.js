import express from "express";
import {
    getFieldRulesByModule,
    evaluateFieldRules,
    createFieldRule,
    updateFieldRule,
    deleteFieldRule
} from "./fieldRule.controller.js";

const router = express.Router();

router.get("/:module", getFieldRulesByModule);
router.post("/:module/evaluate", evaluateFieldRules);
router.post("/", createFieldRule);
router.put("/:id", updateFieldRule);
router.delete("/:id", deleteFieldRule);

export default router;
