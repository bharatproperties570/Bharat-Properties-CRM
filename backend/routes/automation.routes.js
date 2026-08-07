import express from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import {
    getTriggers, createTrigger, updateTrigger, deleteTrigger,
    getSequences, createSequence,
    getAutomatedActions, createAutomatedAction
} from '../controllers/automation.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// --- Triggers ---
router.get('/triggers', getTriggers);
router.post('/triggers', createTrigger);
router.put('/triggers/:id', updateTrigger);
router.delete('/triggers/:id', deleteTrigger);

// --- Sequences ---
router.get('/sequences', getSequences);
router.post('/sequences', createSequence);

// --- Automated Actions ---
router.get('/actions', getAutomatedActions);
router.post('/actions', createAutomatedAction);

export default router;
