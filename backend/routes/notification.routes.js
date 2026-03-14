import express from "express";
import { getNotifications, markAsRead, markAllAsRead } from "../controllers/notification.controller.js";
import { protect } from "../middleware/auth.js"; // Standard auth middleware if it exists

const router = express.Router();

// All routes protected by default
router.use(protect);

router.get("/", getNotifications);
router.put("/read-all", markAllAsRead);
router.put("/:id/read", markAsRead);

export default router;
