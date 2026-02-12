import express from "express";
import { getInventory, addInventory, updateInventory, deleteInventory, bulkDeleteInventory, matchInventory, importInventory, checkDuplicatesImport } from "../controllers/inventory.controller.js";

const router = express.Router();

router.put("/:id", updateInventory);
router.get("/", getInventory);
router.post("/import", importInventory);
router.post("/check-duplicates", checkDuplicatesImport);
router.get("/match", matchInventory);
router.post("/", addInventory);
router.post("/bulk-delete", bulkDeleteInventory);
router.delete("/:id", deleteInventory);

export default router;
