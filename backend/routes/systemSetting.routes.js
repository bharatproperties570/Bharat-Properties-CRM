import express from "express";
import {
    getSystemSettings,
    getSystemSettingByKey,
    upsertSystemSetting,
    deleteSystemSetting,
    testAiConnection,
    getStageQualificationConfig
} from "../controllers/systemSetting.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Write operations
router.post("/upsert", upsertSystemSetting);
router.post("/test-ai", testAiConnection);

// Dedicated route for dynamic Stage Qualification Engine config
router.get("/stage-qualification/fields", getStageQualificationConfig);

// Settings read operations
router.get("/", getSystemSettings);
router.get("/:key", getSystemSettingByKey);
router.delete("/:key", deleteSystemSetting);

export default router;
