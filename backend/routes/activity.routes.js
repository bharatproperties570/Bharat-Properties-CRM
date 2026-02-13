import express from "express";
import { getActivities, addActivity, updateActivity, deleteActivity } from "../controllers/activity.controller.js";

const router = express.Router();
router.get("/", getActivities);
router.post("/", addActivity);
router.put("/:id", updateActivity);
router.delete("/:id", deleteActivity);

export default router;
