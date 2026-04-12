import express from "express";
import { getInventory, getInventoryById, addInventory, updateInventory, deleteInventory, bulkDeleteInventory, matchInventory, importInventory, checkDuplicatesImport, bulkUpdatePropertyOwners } from "../controllers/inventory.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.get("/match", matchInventory);
router.get("/:id", getInventoryById);
router.get("/", getInventory);
router.put("/:id", updateInventory);
router.post("/import", importInventory);
router.post("/bulk-update-owners", bulkUpdatePropertyOwners);
router.post("/check-duplicates", checkDuplicatesImport);
router.post("/", addInventory);
router.post("/bulk-delete", bulkDeleteInventory);
router.delete("/:id", deleteInventory);

export default router;
