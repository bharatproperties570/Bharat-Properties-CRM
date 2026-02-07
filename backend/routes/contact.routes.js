import express from "express";
import { getContacts, createContact, getContact } from "../controllers/contact.controller.js";

const router = express.Router();

router.get("/", getContacts);
router.post("/", createContact);
router.get("/:id", getContact);

export default router;
