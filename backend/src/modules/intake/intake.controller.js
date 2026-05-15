import { createWorker } from 'tesseract.js';
import fs from 'fs';
import JSZip from 'jszip';
import pdf from 'pdf-parse';
import path from 'path';
import { parseContent } from './intakeParser.js';
import Intake from '../../../models/Intake.js';
import { addToIntakeQueue } from '../../services/intakeQueue/IntakeQueue.js';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Get all intake records
 */
export const getIntakes = async (req, res) => {
    try {
        // Exclude 'content' to keep the list lightweight
        const intakes = await Intake.find().select('-content').sort({ receivedAt: -1 }).limit(100);
        res.status(200).json({ success: true, data: intakes });
    } catch (error) {
        console.error("[Intake:Get Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get single intake record with full content
 */
export const getIntakeById = async (req, res) => {
    try {
        const intake = await Intake.findById(req.params.id);
        if (!intake) return res.status(404).json({ success: false, message: 'Intake record not found' });
        res.status(200).json({ success: true, data: intake });
    } catch (error) {
        console.error("[Intake:GetById Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update intake status
 */
export const updateIntakeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const intake = await Intake.findByIdAndUpdate(id, { status }, { new: true });
        if (!intake) return res.status(404).json({ success: false, message: 'Intake record not found' });

        res.status(200).json({ success: true, data: intake });
    } catch (error) {
        console.error("[Intake:Update Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Create a manual intake record using the Unified Queue
 */
export const createIntake = async (req, res) => {
    try {
        const { source, content, campaignName } = req.body;
        
        // Directly push to the new Queue architecture
        const result = await addToIntakeQueue('manual', { text: content, source, campaignName }, req.user?.id);
        
        if (!result.success) {
            return res.status(409).json({ success: false, message: result.message, data: { _id: result.intakeId } });
        }

        res.status(201).json({ success: true, message: 'Intake queued successfully', data: { _id: result.intakeId } });
    } catch (error) {
        console.error("[Intake:Create Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Delete an intake record
 */
export const deleteIntake = async (req, res) => {
    try {
        const { id } = req.params;
        const intake = await Intake.findByIdAndDelete(id);
        if (!intake) return res.status(404).json({ success: false, message: 'Intake record not found' });
        res.status(200).json({ success: true, message: 'Intake deleted successfully' });
    } catch (error) {
        console.error("[Intake:Delete Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Process OCR for an uploaded image
 */
export const processOCR = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file uploaded" });
        }

        // Initialize Tesseract Worker
        const start = Date.now();
        console.log(`[Intake:OCR] Starting Tesseract worker for file ${req.file.filename}...`);
        const worker = await createWorker('eng');
        try {
            const { data: { text } } = await worker.recognize(req.file.path);
            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.log(`[Intake:OCR] Recognition complete in ${duration}s. Text length: ${text.length}`);
            
            const parsed = await parseContent(text);
            console.log(`[Intake:OCR] Logic parsing complete.`);

            // Create Intake Record
            const intake = await Intake.create({
                source: 'Camera',
                content: text,
                category: 'new',
                status: 'Raw Received',
                receivedAt: new Date(),
                meta: {
                    fileName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    parsedData: parsed
                }
            });

            // Cleanup uploaded file
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(200).json({
                success: true,
                data: intake
            });
        } finally {
            await worker.terminate();
        }
    } catch (error) {
        console.error("[Intake:OCR Error]:", error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: error.message || "OCR Processing Failed" });
    }
};

/**
 * Process a ZIP file for text/CSV content using Unified Queue
 */
export const processZIP = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No ZIP file uploaded" });
        }

        const result = await addToIntakeQueue('zip', {
            filePath: req.file.path,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype
        }, req.user?.id);

        if (!result.success) {
            return res.status(409).json({ success: false, message: result.message, data: { _id: result.intakeId } });
        }

        res.status(200).json({
            success: true,
            message: 'ZIP queued for processing',
            data: { _id: result.intakeId }
        });
    } catch (error) {
        console.error("[Intake:ZIP Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Process a PDF file using Unified Queue
 */
export const processPDF = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No PDF file uploaded" });
        }

        const result = await addToIntakeQueue('pdf', {
            filePath: req.file.path,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype
        }, req.user?.id);

        if (!result.success) {
            return res.status(409).json({ success: false, message: result.message, data: { _id: result.intakeId } });
        }

        res.status(200).json({
            success: true,
            message: 'PDF queued for processing',
            data: { _id: result.intakeId }
        });
    } catch (error) {
        console.error("[Intake:PDF Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
