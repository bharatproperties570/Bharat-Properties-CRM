import express from "express";
import { getAllAgents, getAgentById, createAgent, updateAgent, deleteAgent } from "./aiAgent.controller.js";

const router = express.Router();

router.route("/")
    .get(getAllAgents)
    .post(createAgent);

router.route("/:id")
    .get(getAgentById)
    .put(updateAgent)
    .delete(deleteAgent);

export default router;
