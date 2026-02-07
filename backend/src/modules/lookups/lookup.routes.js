import express from "express";
import {
    getLookupsByType,
    getAllLookups,
    createLookup,
    updateLookup,
    deleteLookup,
    bulkCreateLookups
} from "./lookup.controller.js";

const router = express.Router();

router.get("/", getAllLookups);
router.post("/bulk", bulkCreateLookups);
router.get("/:type", getLookupsByType);
router.post("/", createLookup);
router.put("/:id", updateLookup);
router.delete("/:id", deleteLookup);

export default router;
