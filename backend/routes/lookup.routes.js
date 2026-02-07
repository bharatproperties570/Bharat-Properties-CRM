import express from "express";
import { getLookups, addLookup, updateLookup, deleteLookup } from "../controllers/lookup.controller.js";

const router = express.Router();
// Handle generic lookups
router.get("/", getLookups);
router.post("/", addLookup);
router.put("/:id", updateLookup);
router.delete("/:id", deleteLookup);

// Support legacy-style endpoints if needed, but for now just standard REST
// Frontend will be updated to use /lookups with query params

export default router;
