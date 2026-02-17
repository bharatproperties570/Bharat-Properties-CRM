import express from "express";
import {
    getDuplicationRules,
    createDuplicationRule,
    updateDuplicationRule,
    deleteDuplicationRule,
    checkDuplicates,
    checkDocument
} from "../controllers/duplicationRule.controller.js";

const router = express.Router();

router.get("/", getDuplicationRules);
router.post("/", createDuplicationRule);
router.put("/:id", updateDuplicationRule);
router.delete("/:id", deleteDuplicationRule);
router.post("/check", checkDuplicates);
router.post("/check-document", checkDocument);

export default router;
