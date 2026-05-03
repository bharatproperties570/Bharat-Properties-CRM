import express from "express";
import { createForm, getForms, getFormBySlug, updateForm, deleteForm, submitForm, getDynamicOptions, resolveToken } from "../controllers/dynamicForm.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Private routes
router.post("/", authenticate, createForm);
router.get("/", authenticate, getForms);
router.put("/:id", authenticate, updateForm);
router.delete("/:id", authenticate, deleteForm);

// Public routes (for the actual form rendering)
router.get("/public/resolve-token/:token", resolveToken); // 🚀 Smart Pre-fill resolver
router.get("/public/options/:source", getDynamicOptions); // 🚀 New: Fetch projects/users for public forms
router.get("/public/:slug", getFormBySlug);
router.post("/public/:slug/submit", submitForm);

export default router;
