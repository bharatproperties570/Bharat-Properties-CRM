import express from "express";
import { getInventory, addInventory, updateInventory, deleteInventory, bulkDeleteInventory, matchInventory } from "../controllers/inventory.controller.js";

const router = express.Router();

router.get("/", getInventory);
router.post("/", addInventory);
router.post("/bulk-delete", bulkDeleteInventory);
router.put("/:id", updateInventory);
router.delete("/:id", deleteInventory);
router.get("/match", matchInventory);

export default router;
