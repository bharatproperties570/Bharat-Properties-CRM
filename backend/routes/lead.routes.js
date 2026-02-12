import express from "express";
import { getLeads, addLead, deleteLead, bulkDeleteLeads, getLeadById, importLeads, checkDuplicatesImport } from "../controllers/lead.controller.js";

const router = express.Router();

router.get("/", getLeads);
router.get("/:id", getLeadById);
router.post("/import", importLeads);
router.post("/check-duplicates", checkDuplicatesImport);
router.post("/", addLead);
router.post("/bulk-delete", bulkDeleteLeads);
router.delete("/:id", deleteLead);

export default router;
