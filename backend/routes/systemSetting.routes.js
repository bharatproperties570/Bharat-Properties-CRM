import express from "express";
import {
    getSystemSettings,
    getSystemSettingByKey,
    upsertSystemSetting,
    deleteSystemSetting,
    testAiConnection,
    getStageQualificationConfig,
    reEvaluateExistingLeadsQualification
} from "../controllers/systemSetting.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Write operations
router.post("/upsert", upsertSystemSetting);
router.post("/test-ai", testAiConnection);

// Dedicated routes for dynamic Stage Qualification Engine config & batch re-evaluation
router.get("/stage-qualification/fields", getStageQualificationConfig);
router.post("/stage-qualification/re-evaluate", reEvaluateExistingLeadsQualification);

// Settings read operations
router.get("/", getSystemSettings);
router.get("/:key", getSystemSettingByKey);
router.delete("/:key", deleteSystemSetting);

export default router;
