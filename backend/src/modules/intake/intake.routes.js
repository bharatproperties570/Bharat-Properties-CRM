import express from 'express';
import { uploadImageOnly, uploadZipOnly, uploadPdfOnly } from '../../middlewares/upload.middleware.js';
import { 
    processOCR, processZIP, processPDF, processURL, 
    getIntakes, getIntakeById, updateIntakeStatus, createIntake, deleteIntake,
    createAutomatedSource, getAutomatedSources, toggleAutomatedSource, deleteAutomatedSource,
    getIntakeGroups, toggleIntakeGroup, triggerGroupScan, backfillIntakeGroup
} from './intake.controller.js';
import { authenticate } from "../../../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * WhatsApp Group Intake Routes (MUST be defined before /:id)
 */
router.get('/groups', getIntakeGroups);
router.patch('/groups/:id/toggle', toggleIntakeGroup);
router.post('/groups/scan-now', triggerGroupScan);
router.post('/groups/:id/backfill', backfillIntakeGroup);

/**
 * Automated Monitor Routes (MUST be defined before /:id)
 */
router.post('/monitors', createAutomatedSource);
router.get('/monitors', getAutomatedSources);
router.patch('/monitors/:id/toggle', toggleAutomatedSource);
router.delete('/monitors/:id', deleteAutomatedSource);

/**
 * File & Content Processing Routes
 */
router.post('/ocr', uploadImageOnly.single('image'), processOCR);
router.post('/zip', uploadZipOnly.single('file'), processZIP);
router.post('/pdf', uploadPdfOnly.single('file'), processPDF);
router.post('/url', processURL);

/**
 * Core Intake Collection Routes
 */
router.get('/', getIntakes);
router.post('/', createIntake);

/**
 * Single Intake Record Wildcard Routes (MUST be last)
 */
router.get('/:id', getIntakeById);
router.patch('/:id', updateIntakeStatus);
router.delete('/:id', deleteIntake);

export default router;
