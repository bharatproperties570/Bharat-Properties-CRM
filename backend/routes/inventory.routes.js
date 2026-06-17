import express from "express";
import { getInventory, getInventoryById, addInventory, bulkAddInventory, updateInventory, deleteInventory, bulkDeleteInventory, matchInventory, importInventory, checkDuplicatesImport, bulkUpdatePropertyOwners, getUniqueBlocks, getSuggestedOwners, bulkUpdateInventory, autoResolveConflicts } from "../controllers/inventory.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.get("/match", matchInventory);
router.get("/blocks", getUniqueBlocks);
router.get("/:id/suggested-owners", getSuggestedOwners);
router.get("/:id", getInventoryById);
router.get("/", getInventory);
router.put("/:id", updateInventory);
router.post("/import", importInventory);
router.post("/bulk-update-owners", bulkUpdatePropertyOwners);
router.post("/bulk-auto-resolve", autoResolveConflicts);
router.post("/check-duplicates", checkDuplicatesImport);
router.post("/", addInventory);
router.post("/bulk-delete", bulkDeleteInventory);
router.post("/bulk-add", bulkAddInventory);
router.post("/bulk-update", bulkUpdateInventory);
router.delete("/:id", deleteInventory);

export default router;
