import express from "express";
import {
    createForm, getForms, getFormById, updateForm, deleteForm,
    getFormBySlug, submitFeedback
} from "../controllers/feedbackForm.controller.js";

const router = express.Router();

router.post("/", createForm);
router.get("/", getForms);
router.get("/:id", getFormById);
router.put("/:id", updateForm);
router.delete("/:id", deleteForm);

router.get("/public/:slug", getFormBySlug);
router.post("/public/:slug/submit", submitFeedback);

export default router;
