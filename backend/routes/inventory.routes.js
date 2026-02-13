import express from "express";
import { getInventory, getInventoryById, addInventory, updateInventory, deleteInventory, bulkDeleteInventory, matchInventory, importInventory, checkDuplicatesImport } from "../controllers/inventory.controller.js";

const router = express.Router();

router.get("/match", matchInventory);
router.get("/:id", getInventoryById);
router.get("/", getInventory);
router.put("/:id", updateInventory);
router.post("/import", importInventory);
router.post("/check-duplicates", checkDuplicatesImport);
router.post("/", addInventory);
router.post("/bulk-delete", bulkDeleteInventory);
router.delete("/:id", deleteInventory);

export default router;
