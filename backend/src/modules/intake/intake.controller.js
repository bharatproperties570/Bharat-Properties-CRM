import { createWorker } from 'tesseract.js';
import fs from 'fs';
import JSZip from 'jszip';
import pdf from 'pdf-parse';
import path from 'path';
import { parseContent } from './intakeParser.js';
import Intake from '../../../models/Intake.js';
import AutomatedIntakeSource from '../../../models/AutomatedIntakeSource.js';
import { addToIntakeQueue } from '../../../services/intakeQueue/IntakeQueue.js';
import automatedIntakeService from '../../../services/intakeQueue/AutomatedIntakeService.js';
import connectorRegistry from '../../../services/intakeConnectors/ConnectorRegistry.js';

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
        let errMsg = error.message;
        if (
            errMsg.includes("timed out") || 
            errMsg.includes("27017") || 
            errMsg.includes("MongoNetworkError") || 
            errMsg.includes("MongooseError") ||
            errMsg.includes("ECONNREFUSED")
        ) {
            errMsg = "Database Connection Timeout: The CRM backend could not connect to your MongoDB Atlas database. This is usually caused by an un-whitelisted dynamic IP address on your local internet connection. To permanently fix this: Log into MongoDB Cloud Console (cloud.mongodb.com) -> Security -> Network Access -> Add '0.0.0.0/0' (Allow Access from Anywhere).";
        }
        res.status(500).json({ success: false, message: errMsg });
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
        const result = await addToIntakeQueue('manual', { text: content, source, campaignName }, req.user?._id || req.user?.id);
        
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
            console.warn("[Intake:OCR] No file in request. Body:", req.body);
            console.warn("[Intake:OCR] Headers:", req.headers);
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
            console.warn("[Intake:ZIP] No file in request. Body:", req.body);
            console.warn("[Intake:ZIP] Headers:", req.headers);
            return res.status(400).json({ success: false, message: "No ZIP file uploaded" });
        }

        const result = await addToIntakeQueue('zip', {
            filePath: req.file.path,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype
        }, req.user?._id || req.user?.id);

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
            console.warn("[Intake:PDF] No file in request. Body:", req.body);
            console.warn("[Intake:PDF] Headers:", req.headers);
            return res.status(400).json({ success: false, message: "No PDF file uploaded" });
        }

        const result = await addToIntakeQueue('pdf', {
            filePath: req.file.path,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype
        }, req.user?._id || req.user?.id);

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

/**
 * Process a Public URL (Property Listing, Builder Page, etc.)
 */
export const processURL = async (req, res) => {
    try {
        const { url, source = 'Website', source_type = 'public_url' } = req.body;

        if (!url || typeof url !== 'string' || url.trim() === '') {
            return res.status(400).json({ success: false, message: "URL is required" });
        }

        let urlToProcess = url.trim();
        if (!urlToProcess.startsWith('http://') && !urlToProcess.startsWith('https://')) {
            urlToProcess = `https://${urlToProcess}`;
        }

        // Basic URL validation
        try {
            new URL(urlToProcess);
        } catch (e) {
            return res.status(400).json({ success: false, message: "Invalid URL format" });
        }

        const result = await addToIntakeQueue(source_type, {
            url: urlToProcess,
            source: source
        }, req.user?._id || req.user?.id);

        if (!result.success) {
            return res.status(409).json({ success: false, message: result.message, data: { _id: result.intakeId } });
        }

        res.status(200).json({
            success: true,
            message: 'URL queued for processing',
            data: { _id: result.intakeId }
        });
    } catch (error) {
        console.error("[Intake:URL Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Create a new automated intake source (monitor)
 */
export const createAutomatedSource = async (req, res) => {
    try {
        const { url, source = 'Automated Monitor', frequency = 'daily' } = req.body;

        if (!url || typeof url !== 'string' || url.trim() === '') {
            return res.status(400).json({ success: false, message: "URL is required" });
        }

        let urlToProcess = url.trim();
        if (!urlToProcess.startsWith('http://') && !urlToProcess.startsWith('https://')) {
            urlToProcess = `https://${urlToProcess}`;
        }

        // Basic URL validation
        try {
            new URL(urlToProcess);
        } catch (e) {
            return res.status(400).json({ success: false, message: "Invalid URL format" });
        }

        const automatedSource = await AutomatedIntakeSource.create({
            url: urlToProcess,
            source,
            frequency,
            createdBy: req.user?._id || req.user?.id
        });

        // Schedule the job immediately
        automatedIntakeService.scheduleSource(automatedSource);

        res.status(201).json({
            success: true,
            message: 'Automated monitor created successfully',
            data: automatedSource
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "You are already monitoring this URL" });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all automated intake sources for the current user
 */
export const getAutomatedSources = async (req, res) => {
    try {
        const sources = await AutomatedIntakeSource.find({ createdBy: req.user?._id || req.user?.id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: sources });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Toggle an automated source (active/inactive)
 */
export const toggleAutomatedSource = async (req, res) => {
    try {
        const { id } = req.params;
        const source = await AutomatedIntakeSource.findOne({ _id: id, createdBy: req.user?._id || req.user?.id });

        if (!source) {
            return res.status(404).json({ success: false, message: "Source not found" });
        }

        source.is_active = !source.is_active;
        await source.save();

        if (source.is_active) {
            automatedIntakeService.scheduleSource(source);
        } else {
            automatedIntakeService.stopSource(source._id);
        }

        res.status(200).json({
            success: true,
            message: `Monitor ${source.is_active ? 'activated' : 'deactivated'}`,
            data: source
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Delete an automated source
 */
export const deleteAutomatedSource = async (req, res) => {
    try {
        const { id } = req.params;
        const source = await AutomatedIntakeSource.findOneAndDelete({ _id: id, createdBy: req.user?._id || req.user?.id });

        if (!source) {
            return res.status(404).json({ success: false, message: "Source not found" });
        }

        // Stop the scheduled job
        automatedIntakeService.stopSource(id);

        res.status(200).json({ success: true, message: 'Monitor deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

