import express from "express";
import rateLimit from "express-rate-limit";
import { login, register, refresh, logout, forgotPassword, resetPassword, getMe } from "../controllers/auth.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500, // Temporarily increased for verification
    message: { success: false, message: "Too many login attempts from this IP, please try again after 15 minutes" },
    standardHeaders: true,
    legacyHeaders: false
});

router.post("/login", loginLimiter, login);
router.post("/register", register);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get("/me", authenticate, getMe);

export default router;
