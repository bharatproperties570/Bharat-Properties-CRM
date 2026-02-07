import express from "express";
import { getLeads, addLead, deleteLead } from "../controllers/lead.controller.js";

const router = express.Router();

router.get("/", getLeads);
router.post("/", addLead);
router.delete("/:id", deleteLead);

export default router;
