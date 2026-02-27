import express from 'express';
import multer from 'multer';
import { processOCR, processZIP, processPDF, getIntakes, updateIntakeStatus, createIntake, deleteIntake } from './intake.controller.js';

const router = express.Router();

// Multer configuration for temporary file handling
const upload = multer({ dest: 'uploads/' });

/**
 * @route   GET /api/intake
 * @desc    Get all intake records
 */
router.get('/', getIntakes);

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
router.post('/ocr', upload.single('image'), processOCR);

/**
 * @route   POST /api/intake/zip
 * @desc    Process and extract content from a ZIP file
 */
router.post('/zip', upload.single('file'), processZIP);

/**
 * @route   POST /api/intake/pdf
 * @desc    Process a PDF file
 */
router.post('/pdf', upload.single('file'), processPDF);

export default router;
