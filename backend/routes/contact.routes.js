import express from "express";
import { getContacts, createContact, getContact, updateContact, deleteContact, searchDuplicates } from "../controllers/contact.controller.js";

const router = express.Router();

router.get("/", getContacts);
router.get("/search/duplicates", searchDuplicates);
router.post("/", createContact);
router.get("/:id", getContact);
router.put("/:id", updateContact);
router.delete("/:id", deleteContact);

export default router;
