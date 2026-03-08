import express from "express";
import { getLeads, addLead, updateLead, deleteLead, bulkDeleteLeads, getLeadById, importLeads, checkDuplicatesImport, matchLeads, toggleLeadInterest } from "../controllers/lead.controller.js";

const router = express.Router();

router.get("/", getLeads);
router.get("/match", matchLeads);
router.get("/:id", getLeadById);
router.post("/import", importLeads);
router.post("/check-duplicates", checkDuplicatesImport);
router.post("/", addLead);
router.put("/:id", updateLead);
router.post("/bulk-delete", bulkDeleteLeads);
router.put("/interest/:inventoryId", toggleLeadInterest);
router.delete("/:id", deleteLead);

export default router;
