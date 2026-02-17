import express from "express";
import {
    createTeam,
    getTeams,
    getTeam,
    updateTeam,
    deleteTeam
} from "../controllers/team.controller.js";

const router = express.Router();

router.route("/")
    .get(getTeams)
    .post(createTeam);

router.route("/:id")
    .get(getTeam)
    .put(updateTeam)
    .delete(deleteTeam);

export default router;
