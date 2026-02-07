import express from "express";
import { getLeads, addLead } from "../controllers/lead.controller.js";

const router = express.Router();

router.get("/", getLeads);
router.post("/", addLead);

export default router;
