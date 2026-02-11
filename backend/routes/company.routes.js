import express from "express";
const router = express.Router();
import { getCompanies, getCompany, addCompany, updateCompany, deleteCompany } from "../controllers/company.controller.js";

router.get("/", getCompanies);
router.get("/:id", getCompany);
router.post("/", addCompany);
router.put("/:id", updateCompany);
router.delete("/:id", deleteCompany);

export default router;
