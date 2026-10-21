import express from "express";
import rateLimit from "express-rate-limit";
import {
    createForm, getForms, getFormById, updateForm, deleteForm,
    getFormBySlug, submitFeedback
} from "../controllers/feedbackForm.controller.js";

const router = express.Router();

// 🛡️ CRITICAL-01: Public Security Headers Middleware
const publicFeedbackSecurityHeaders = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
};

// 🛡️ CRITICAL-01: Rate Limiters for Public Feedback Routes
const publicFormFetchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // 100 requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many form requests, please try again later." }
});

const publicFormSubmitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25, // 25 submissions per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many submission attempts, please try again later." }
});

router.post("/", createForm);
router.get("/", getForms);
router.get("/:id", getFormById);
router.put("/:id", updateForm);
router.delete("/:id", deleteForm);

router.get("/public/:slug", publicFeedbackSecurityHeaders, publicFormFetchLimiter, getFormBySlug);
router.post("/public/:slug/submit", publicFeedbackSecurityHeaders, publicFormSubmitLimiter, submitFeedback);

export { publicFeedbackSecurityHeaders, publicFormFetchLimiter, publicFormSubmitLimiter };
export default router;
