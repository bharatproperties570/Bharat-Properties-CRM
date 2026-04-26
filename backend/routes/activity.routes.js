import express from "express";
import { 
    getActivities, 
    getActivityById, 
    addActivity, 
    updateActivity, 
    deleteActivity, 
    getUnifiedTimeline, 
    syncMobileCalls, 
    getMessagingActivities, 
    getActivitiesByEntity,
    sendReply,
    convertToLead
} from "../controllers/activity.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.get("/", getActivities);
router.get("/messaging", getMessagingActivities);
router.post("/messaging/reply", sendReply);
router.post("/messaging/convert-to-lead", convertToLead);
router.get("/entity/:entityType/:entityId", getActivitiesByEntity);
router.get("/:id", getActivityById);
router.get("/unified/:entityType/:entityId", getUnifiedTimeline);
router.post("/", addActivity);
router.post("/mobile-sync", syncMobileCalls);
router.put("/:id", updateActivity);
router.delete("/:id", deleteActivity);

export default router;
