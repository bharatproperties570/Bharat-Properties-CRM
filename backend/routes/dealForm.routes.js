import express from "express";
import {
    createForm,
    getForms,
    getFormById,
    updateForm,
    deleteForm,
    getFormBySlug,
    submitDealForm,
    getPublicInventoryProjects,
    getPublicInventoryBlocks,
    getPublicInventoryUnits,
    getPublicRelations
} from "../controllers/dealForm.controller.js";

const router = express.Router();

// Builder Routes (Private)
router.post("/", createForm);
router.get("/", getForms);
router.get("/:id", getFormById);
router.put("/:id", updateForm);
router.delete("/:id", deleteForm);

// Public Routes
router.get("/public/inventory/projects", getPublicInventoryProjects);
router.get("/public/inventory/blocks", getPublicInventoryBlocks);
router.get("/public/inventory/units", getPublicInventoryUnits);
router.get("/public/inventory/relations", getPublicRelations);
router.get("/public/:slug", getFormBySlug);
router.post("/public/:slug/submit", submitDealForm);

export default router;
