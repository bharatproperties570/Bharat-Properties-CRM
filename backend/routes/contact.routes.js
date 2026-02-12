import express from "express";
import { getContacts, createContact, updateContact, deleteContact, getContact, searchDuplicates, importContacts, checkDuplicatesImport } from "../controllers/contact.controller.js";

const router = express.Router();

router.get("/", getContacts);
router.get("/search/duplicates", searchDuplicates);
router.post("/import", importContacts);
router.post("/check-duplicates", checkDuplicatesImport);
router.post("/", createContact);
router.get("/:id", getContact);
router.put("/:id", updateContact);
router.delete("/:id", deleteContact);

export default router;
