import express from "express";
import {
    getAllRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole
} from "../controllers/role.controller.js";

const router = express.Router();

router.route("/")
    .get(getAllRoles)
    .post(createRole);

router.route("/:id")
    .get(getRoleById)
    .put(updateRole)
    .delete(deleteRole);

export default router;
