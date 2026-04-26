import express from "express";
import { getLeads, addLead, updateLead, deleteLead, bulkDeleteLeads, getLeadById, importLeads, checkDuplicatesImport, matchLeads, toggleLeadInterest } from "../controllers/lead.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { validateBusinessRules } from "../src/middlewares/businessRule.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.get("/", getLeads);
router.get("/match", matchLeads);
router.get("/:id", getLeadById);
router.post("/import", importLeads);
router.post("/check-duplicates", checkDuplicatesImport);
router.post("/", validateBusinessRules('leads'), addLead);
router.put("/:id", validateBusinessRules('leads'), updateLead);
router.post("/bulk-delete", bulkDeleteLeads);
router.put("/interest/:inventoryId", toggleLeadInterest);
router.delete("/:id", deleteLead);

export default router;
