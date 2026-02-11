import express from "express";
const router = express.Router();
import { getDeals, getDealById, addDeal, updateDeal, deleteDeal, bulkDeleteDeals } from "../controllers/deal.controller.js";

router.get("/", getDeals);
router.get("/:id", getDealById);
router.post("/", addDeal);
router.post("/bulk-delete", bulkDeleteDeals);
router.put("/:id", updateDeal);
router.delete("/:id", deleteDeal);

export default router;
