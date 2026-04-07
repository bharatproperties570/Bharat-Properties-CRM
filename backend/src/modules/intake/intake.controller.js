import { createWorker } from 'tesseract.js';
import fs from 'fs';
import JSZip from 'jszip';
import pdf from 'pdf-parse';
import path from 'path';
import { parseContent } from './intakeParser.js';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
import Intake from '../../../models/Intake.js';

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
 * Create a manual intake record
 */
export const createIntake = async (req, res) => {
    try {
        const { source, content, campaignName } = req.body;
        const parsed = await parseContent(content);

        const intake = await Intake.create({
            source: source || 'Manual',
            content,
            campaignName,
            category: 'new',
            status: 'Raw Received',
            receivedAt: new Date(),
            meta: {
                parsedData: parsed
            }
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
                    size: text.length,
                    type: lowerName.endsWith('.csv') ? 'CSV' : 'TEXT'
                });
            }
        }

        // Create Intake Records for each significant file or one consolidated?
        // Let's consolidate for now to keep the UI clean, or create multiple if requested.
        // Consolidation is safer for "Importing WhatsApp Zip".
        const consolidatedContent = extractedTexts.map(t => `--- File: ${t.filename} ---\n${t.content}`).join('\n\n');

        const parsedItems = await Promise.all(extractedTexts.map(t => parseContent(t.content)));

        const intake = await Intake.create({
            source: 'WhatsApp',
            content: consolidatedContent,
            category: 'new',
            status: 'Raw Received',
            receivedAt: new Date(),
            meta: {
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                parsedData: parsedItems // Full parsed data for each file
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

        const data = await pdf(req.file.path);
        const extractedText = data.text;
        const metadata = data.info || {};
        
        // Combine text with useful metadata (Title, Author, Subject, Keywords) for better parsing
        const metadataText = [
            metadata.Title,
            metadata.Author,
            metadata.Subject,
            metadata.Keywords
        ].filter(Boolean).join(' ');

        // Determine final content and if it's likely a scan
        let finalContent = extractedText;
        let isScanLikely = false;

        // If extracted text is very short and metadata is also sparse, it's likely a scan or image-only PDF
        if (extractedText.trim().length < 50 && metadataText.trim().length < 10) {
            isScanLikely = true;
            finalContent = `[SYSTEM NOTE: This PDF appears to be a scan or image-only file. Automatic text extraction was limited. Please use the 'Camera' intake for OCR processing if needed.]\n\n` + extractedText;
        } else if (metadataText.trim().length > 0) {
            // Prepend metadata if available and not a likely scan
            finalContent = `${metadataText}\n\n${extractedText}`;
        }


        const parsed = await parseContent(finalContent);

        const intake = await Intake.create({
            source: 'Tribune',
            content: finalContent,
            category: 'new',
            status: isScanLikely ? 'Needs Review' : 'Raw Received',
            receivedAt: new Date(),
            meta: {
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                info: data.info,
                pages: data.numpages,
                parsedData: parsed,
                wasScanSynced: isScanLikely
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
