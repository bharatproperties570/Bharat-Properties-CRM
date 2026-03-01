import express from "express";
import rateLimit from "express-rate-limit";
import { login, register, refresh, logout } from "../controllers/auth.controller.js";

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: { success: false, message: "Too many login attempts from this IP, please try again after 15 minutes" },
    standardHeaders: true,
    legacyHeaders: false
});

router.post("/login", loginLimiter, login);
router.post("/register", register);
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
