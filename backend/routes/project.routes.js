import express from "express";
import { getProjects, addProject, updateProject, deleteProject, importProjects, checkDuplicatesImport, getProjectById } from "../controllers/project.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes below
router.use(authenticate);

router.get("/", getProjects);
router.get("/:id", getProjectById);
router.post("/import", importProjects);
router.post("/check-duplicates", checkDuplicatesImport);
router.post("/", addProject);
router.put("/:id", updateProject);
router.delete("/:id", deleteProject);

export default router;
