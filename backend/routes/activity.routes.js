import express from "express";
import { getActivities, addActivity } from "../controllers/activity.controller.js";

const router = express.Router();
router.get("/", getActivities);
router.post("/", addActivity);

export default router;
