import express from "express";
import { getSystemSettings, getSystemSettingByKey, upsertSystemSetting, deleteSystemSetting, testAiConnection } from "../controllers/systemSetting.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Write operations
router.post("/upsert", upsertSystemSetting);
router.post("/test-ai", testAiConnection);

// Settings read operations
router.get("/", getSystemSettings);
router.get("/:key", getSystemSettingByKey);
router.delete("/:key", deleteSystemSetting);

export default router;
