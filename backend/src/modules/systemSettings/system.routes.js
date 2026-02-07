import express from "express";
import {
    getSystemSettings,
    getSettingByKey,
    upsertSystemSetting,
    deleteSystemSetting
} from "./system.controller.js";

const router = express.Router();

router.get("/", getSystemSettings);
router.get("/:key", getSettingByKey);
router.post("/", upsertSystemSetting);
router.delete("/:key", deleteSystemSetting);

export default router;
