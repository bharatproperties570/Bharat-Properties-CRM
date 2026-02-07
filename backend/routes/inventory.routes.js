import express from "express";
import { matchInventory } from "../controllers/inventory.controller.js";

const router = express.Router();
router.get("/match", matchInventory);

export default router;
