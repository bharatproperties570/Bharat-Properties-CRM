import express from "express";
import { getInventory, getInventoryById, addInventory, bulkAddInventory, updateInventory, deleteInventory, bulkDeleteInventory, matchInventory, importInventory, checkDuplicatesImport, bulkUpdatePropertyOwners, getUniqueBlocks, getSuggestedOwners, bulkUpdateInventory, autoResolveConflicts , exportInventors, restoreInventory } from "../controllers/inventory.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { inventoryWriteLock } from "../middleware/inventoryWriteLock.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Unlocked GET routes
router.get("/match", matchInventory);
router.get("/blocks", getUniqueBlocks);
router.get("/:id/suggested-owners", getSuggestedOwners);
router.get("/export", exportInventors);
router.get("/:id", getInventoryById);
router.get("/", getInventory);

// Locked POST/PUT/PATCH/DELETE routes
router.use(inventoryWriteLock);

router.put("/:id/restore", restoreInventory); // NEW route for R8
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
