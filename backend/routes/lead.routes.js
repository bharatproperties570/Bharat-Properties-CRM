import express from "express";
import { getLeads, addLead, deleteLead, bulkDeleteLeads, getLeadById } from "../controllers/lead.controller.js";

const router = express.Router();

router.get("/", getLeads);
router.get("/:id", getLeadById);
router.post("/", addLead);
router.post("/bulk-delete", bulkDeleteLeads);
router.delete("/:id", deleteLead);

export default router;
