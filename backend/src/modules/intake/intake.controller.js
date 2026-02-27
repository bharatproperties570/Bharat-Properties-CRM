import { createWorker } from 'tesseract.js';
import fs from 'fs';
import JSZip from 'jszip';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import Intake from '../../../models/Intake.js';

/**
 * Get all intake records
 */
export const getIntakes = async (req, res) => {
    try {
        const intakes = await Intake.find().sort({ receivedAt: -1 });
        res.status(200).json({ success: true, data: intakes });
    } catch (error) {
        console.error("[Intake:Get Error]:", error);
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
 * Create a manual intake record
 */
export const createIntake = async (req, res) => {
    try {
        const { source, content, campaignName } = req.body;
        const intake = await Intake.create({
            source: source || 'Manual',
            content,
            campaignName,
            status: 'Raw Received',
            receivedAt: new Date()
        });
        res.status(201).json({ success: true, data: intake });
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

        console.log(`[Intake:OCR] Processing image: ${req.file.filename}`);

        // Initialize Tesseract Worker
        const worker = await createWorker('eng');
        const { data: { text } } = await worker.recognize(req.file.path);
        await worker.terminate();

        // Create Intake Record
        const intake = await Intake.create({
            source: 'Camera',
            content: text,
            status: 'Raw Received',
            receivedAt: new Date(),
            meta: {
                fileName: req.file.originalname,
                mimeType: req.file.mimetype
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
    } catch (error) {
        console.error("[Intake:OCR Error]:", error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Process a ZIP file for text/CSV content
 */
export const processZIP = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No ZIP file uploaded" });
        }

        console.log(`[Intake:ZIP] Processing ZIP: ${req.file.filename}`);
        const data = fs.readFileSync(req.file.path);
        const zip = new JSZip();
        const contents = await zip.loadAsync(data);

        const extractedTexts = [];

        for (const filename of Object.keys(contents.files)) {
            const file = contents.files[filename];

            if (file.dir || filename.startsWith('__MACOSX') || filename.split('/').pop().startsWith('.')) {
                continue;
            }

            const lowerName = filename.toLowerCase();
            if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) {
                const text = await file.async('string');
                extractedTexts.push({
                    filename,
                    content: text,
                    type: lowerName.endsWith('.csv') ? 'CSV' : 'TEXT'
                });
            }
        }

        // Create Intake Records for each significant file or one consolidated?
        // Let's consolidate for now to keep the UI clean, or create multiple if requested.
        // Consolidation is safer for "Importing WhatsApp Zip".
        const consolidatedContent = extractedTexts.map(t => `--- File: ${t.filename} ---\n${t.content}`).join('\n\n');

        const intake = await Intake.create({
            source: 'WhatsApp',
            content: consolidatedContent,
            status: 'Raw Received',
            receivedAt: new Date(),
            meta: {
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                parsedData: extractedTexts
            }
        });

        // Cleanup
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(200).json({
            success: true,
            data: intake
        });
    } catch (error) {
        console.error("[Intake:ZIP Error]:", error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Process a PDF file
 */
export const processPDF = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No PDF file uploaded" });
        }

        console.log(`[Intake:PDF] Processing PDF: ${req.file.filename}`);
        const dataBuffer = fs.readFileSync(req.file.path);

        const data = await pdf(dataBuffer);

        const intake = await Intake.create({
            source: 'Tribune',
            content: data.text,
            status: 'Raw Received',
            receivedAt: new Date(),
            meta: {
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                info: data.info
            }
        });

        // Cleanup
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(200).json({
            success: true,
            data: intake
        });
    } catch (error) {
        console.error("[Intake:PDF Error]:", error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: error.message });
    }
};
