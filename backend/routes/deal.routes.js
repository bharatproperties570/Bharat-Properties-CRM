import express from "express";
import { getDeals, matchDeals, getDealById, addDeal, updateDeal, deleteDeal, bulkDeleteDeals, importDeals, closeDeal, getUniqueBlocks } from "../controllers/deal.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { validateBusinessRules } from "../src/middlewares/businessRule.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.get("/", getDeals);
router.get("/blocks", getUniqueBlocks);
router.get("/match", matchDeals);
router.post("/import", importDeals);
router.get("/:id", getDealById);
router.post("/", validateBusinessRules('deals'), addDeal);
router.post("/bulk-delete", bulkDeleteDeals);
router.put("/:id", validateBusinessRules('deals'), updateDeal);
router.patch("/:id", validateBusinessRules('deals'), updateDeal);
router.post("/:id/close", closeDeal);
router.delete("/:id", deleteDeal);

export default router;
