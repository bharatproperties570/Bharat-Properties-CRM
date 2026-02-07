import express from "express";
import { getFieldRules, createFieldRule, updateFieldRule, deleteFieldRule } from "../controllers/fieldRule.controller.js";

const router = express.Router();

router.get("/", getFieldRules);
router.post("/", createFieldRule);
router.put("/:id", updateFieldRule);
router.delete("/:id", deleteFieldRule);
router.get("/module/:module", getFieldRules); // Alias for filtering

export default router;
