import express from "express";
import { getActivities, getActivityById, addActivity, updateActivity, deleteActivity, getUnifiedTimeline, syncMobileCalls } from "../controllers/activity.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.get("/", getActivities);
router.get("/:id", getActivityById);
router.get("/unified/:entityType/:entityId", getUnifiedTimeline);
router.post("/", addActivity);
router.post("/mobile-sync", syncMobileCalls);
router.put("/:id", updateActivity);
router.delete("/:id", deleteActivity);

export default router;
