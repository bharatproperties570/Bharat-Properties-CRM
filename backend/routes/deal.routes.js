import express from "express";
const router = express.Router();
import { getDeals, matchDeals, getDealById, addDeal, updateDeal, deleteDeal, bulkDeleteDeals, importDeals, closeDeal } from "../controllers/deal.controller.js";

router.get("/", getDeals);
router.get("/match", matchDeals);
router.post("/import", importDeals);
router.get("/:id", getDealById);
router.post("/", addDeal);
router.post("/bulk-delete", bulkDeleteDeals);
router.put("/:id", updateDeal);
router.post("/:id/close", closeDeal);
router.delete("/:id", deleteDeal);

export default router;
