import express from "express";
const router = express.Router();
import { getCompanies, getCompany, addCompany, updateCompany, deleteCompany, bulkDeleteCompanies, importCompanies, checkDuplicatesImport } from "../controllers/company.controller.js";

router.get("/", getCompanies);
router.post("/import", importCompanies);
router.post("/bulk-delete", bulkDeleteCompanies);
router.post("/check-duplicates", checkDuplicatesImport);
router.get("/:id", getCompany);
router.post("/", addCompany);
router.put("/:id", updateCompany);
router.delete("/:id", deleteCompany);

export default router;
