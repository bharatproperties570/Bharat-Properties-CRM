import express from "express";
import {
    getDuplicationRules,
    createDuplicationRule,
    updateDuplicationRule,
    deleteDuplicationRule,
    checkDuplicates,
    checkDocument
} from "../controllers/duplicationRule.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.get("/", getDuplicationRules);
router.post("/", createDuplicationRule);
router.put("/:id", updateDuplicationRule);
router.delete("/:id", deleteDuplicationRule);
router.post("/check", checkDuplicates);
router.post("/check-document", checkDocument);

export default router;
