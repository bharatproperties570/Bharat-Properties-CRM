import express from 'express';
import { uploadImageOnly, uploadZipOnly, uploadPdfOnly, uploadOcrImage } from '../../middlewares/upload.middleware.js';
import { 
    processOCR, processZIP, processPDF, processURL, 
    getIntakes, getIntakeById, updateIntakeStatus, createIntake, deleteIntake,
    claimIntake, getIntakeImage,
    createAutomatedSource, getAutomatedSources, toggleAutomatedSource, deleteAutomatedSource,
    getIntakeGroups, toggleIntakeGroup, triggerGroupScan, backfillIntakeGroup,
    previewWAVerification, sendWAVerification, getWAVerificationStatus,
    getAutoVerificationSettings, updateAutoVerificationSettings, resetAutoVerificationCircuitBreaker
} from './intake.controller.js';
import { authenticate } from "../../../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * 🛡️ Auto-Verification Anti-Ban Settings Routes (MUST be defined before /:id)
 */
router.get('/auto-verification/settings', getAutoVerificationSettings);
router.patch('/auto-verification/settings', updateAutoVerificationSettings);
router.post('/auto-verification/reset-circuit-breaker', resetAutoVerificationCircuitBreaker);

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
router.post('/ocr', uploadOcrImage.single('image'), processOCR);
router.post('/zip', uploadZipOnly.single('file'), processZIP);
router.post('/pdf', uploadPdfOnly.single('file'), processPDF);
router.post('/url', processURL);

/**
 * Core Intake Collection Routes
 */
router.get('/', getIntakes);
router.post('/', createIntake);

/**
 * WhatsApp Verification Desk Routes
 */
router.get('/:id/wa-verification-status', getWAVerificationStatus);
router.post('/:id/wa-verification-preview', previewWAVerification);
router.post('/:id/wa-verification-send', sendWAVerification);

/**
 * Intake Authorization & Image Asset Routes
 */
router.post('/:id/claim', claimIntake);
router.get('/:id/image', getIntakeImage);

/**
 * Single Intake Record Wildcard Routes (MUST be last)
 */
router.get('/:id', getIntakeById);
router.patch('/:id', updateIntakeStatus);
router.delete('/:id', deleteIntake);

export default router;
