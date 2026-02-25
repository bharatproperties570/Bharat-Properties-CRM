import express from "express";
import {
    createForm, getForms, getFormById, updateForm, deleteForm,
    getFormBySlug, submitForm
} from "../controllers/leadForm.controller.js";

const router = express.Router();

// ─── Builder Routes (Private/Protected in production eventually) ─────────────
router.post("/", createForm);
router.get("/", getForms);
router.get("/:id", getFormById);
router.put("/:id", updateForm);
router.delete("/:id", deleteForm);

// ─── Public Routes ───────────────────────────────────────────────────────────
router.get("/public/:slug", getFormBySlug);
router.post("/public/:slug/submit", submitForm);

export default router;
