import express from "express";
import { getGroups, createGroup, updateGroup, deleteGroup, bulkAssign } from "../controllers/companyGroup.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

router.use(authenticate);

router.get("/", getGroups);
router.post("/", createGroup);
router.put("/:id", updateGroup);
router.delete("/:id", deleteGroup);
router.post("/bulk-assign", bulkAssign);

export default router;
