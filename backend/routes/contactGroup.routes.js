import express from "express";
import { getGroups, createGroup, updateGroup, deleteGroup, bulkAssign } from "../controllers/contactGroup.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.route("/")
    .get(getGroups)
    .post(createGroup);

router.post("/bulk-assign", bulkAssign);

router.route("/:id")
    .put(updateGroup)
    .delete(deleteGroup);

export default router;
