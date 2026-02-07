import express from "express";
import {
    getRoles,
    getRole,
    createRole,
    updateRole,
    deleteRole
} from "./role.controller.js";

const router = express.Router();

router.route("/")
    .get(getRoles)
    .post(createRole);

router.route("/:id")
    .get(getRole)
    .put(updateRole)
    .delete(deleteRole);

export default router;
