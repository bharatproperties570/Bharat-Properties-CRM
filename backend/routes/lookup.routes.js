import express from "express";
import { getLookups, addLookup } from "../controllers/lookup.controller.js";

const router = express.Router();
router.get("/", getLookups);
router.post("/", addLookup);

export default router;
