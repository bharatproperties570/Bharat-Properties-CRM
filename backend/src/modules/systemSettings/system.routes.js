import express from "express";
import {
    getSystemSettings,
    getSettingByKey,
    upsertSystemSetting,
    deleteSystemSetting
} from "./system.controller.js";

const router = express.Router();

router.get("/", getSystemSettings);
router.post("/upsert", upsertSystemSetting);
router.get("/:key", getSettingByKey);
router.delete("/:key", deleteSystemSetting);

export default router;
