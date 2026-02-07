import express from "express";
import {
    getCustomFieldsByModule,
    getAllCustomFields,
    createCustomField,
    updateCustomField,
    deleteCustomField
} from "./customField.controller.js";

const router = express.Router();

router.get("/", getAllCustomFields);
router.get("/:module", getCustomFieldsByModule);
router.post("/", createCustomField);
router.put("/:id", updateCustomField);
router.delete("/:id", deleteCustomField);

export default router;
