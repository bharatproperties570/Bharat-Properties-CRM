import express from "express";
import { getSystemSettings, getSystemSettingByKey, upsertSystemSetting, deleteSystemSetting } from "../controllers/systemSetting.controller.js";

const router = express.Router();

// Write operations
router.post("/upsert", upsertSystemSetting);

// Public or Protected routes (add auth middleware if needed)
router.get("/", getSystemSettings);
router.get("/:key", getSystemSettingByKey);
router.delete("/:key", deleteSystemSetting);

export default router;
