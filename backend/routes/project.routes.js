import express from "express";
import { getProjects, addProject, updateProject, deleteProject, importProjects, checkDuplicatesImport } from "../controllers/project.controller.js";

const router = express.Router();
router.get("/", getProjects);
router.post("/import", importProjects);
router.post("/check-duplicates", checkDuplicatesImport);
router.post("/", addProject);
router.put("/:id", updateProject);
router.delete("/:id", deleteProject);

export default router;
