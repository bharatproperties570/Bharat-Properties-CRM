import express from "express";
import {
    getEnrichmentRules,
    saveKeywordRule,
    deleteKeywordRule,
    runEnrichment,
    runMarginDetection,
    getEnrichmentLogs
} from "./enrichment.controller.js";

const router = express.Router();

router.get("/rules", getEnrichmentRules);
router.post("/rules/keyword", saveKeywordRule);
router.delete("/rules/keyword/:id", deleteKeywordRule);

router.post("/run/lead/:leadId", runEnrichment);
router.post("/run/deal/:dealId", runMarginDetection);

router.get("/logs", getEnrichmentLogs);

export default router;
