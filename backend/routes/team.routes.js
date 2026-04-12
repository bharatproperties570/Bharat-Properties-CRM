import express from "express";
import {
    createTeam,
    getTeams,
    getTeam,
    updateTeam,
    deleteTeam
} from "../controllers/team.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.route("/")
    .get(getTeams)
    .post(createTeam);

router.route("/:id")
    .get(getTeam)
    .put(updateTeam)
    .delete(deleteTeam);

export default router;
