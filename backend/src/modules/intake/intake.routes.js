import express from 'express';
import { uploadImageOnly, uploadZipOnly, uploadPdfOnly } from '../../middlewares/upload.middleware.js';
import { processOCR, processZIP, processPDF, getIntakes, getIntakeById, updateIntakeStatus, createIntake, deleteIntake } from './intake.controller.js';

const router = express.Router();

/**
 * @route   GET /api/intake
 * @desc    Get all intake records
 */
router.get('/', getIntakes);
router.get('/:id', getIntakeById);

/**
 * @route   POST /api/intake
 * @desc    Create a manual intake record
 */
router.post('/', createIntake);

/**
 * @route   PATCH /api/intake/:id
 * @desc    Update intake status
 */
router.patch('/:id', updateIntakeStatus);

/**
 * @route   DELETE /api/intake/:id
 * @desc    Delete an intake record
 */
router.delete('/:id', deleteIntake);

/**
 * @route   POST /api/intake/ocr
 * @desc    Process OCR on an uploaded image
 */
router.post('/ocr', uploadImageOnly.single('image'), processOCR);

/**
 * @route   POST /api/intake/zip
 * @desc    Process and extract content from a ZIP file
 */
router.post('/zip', uploadZipOnly.single('file'), processZIP);

/**
 * @route   POST /api/intake/pdf
 * @desc    Process a PDF file
 */
router.post('/pdf', uploadPdfOnly.single('file'), processPDF);

export default router;
