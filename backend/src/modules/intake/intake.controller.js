import { createWorker } from 'tesseract.js';
import fs from 'fs';
import JSZip from 'jszip';
import pdf from 'pdf-parse';
import path from 'path';
import mongoose from 'mongoose';
import { parseContent } from './intakeParser.js';
import Intake from '../../../models/Intake.js';
import IntakeGroupCursor from '../../../models/IntakeGroupCursor.js';
import AutomatedIntakeSource from '../../../models/AutomatedIntakeSource.js';
import { addToIntakeQueue } from '../../../services/intakeQueue/IntakeQueue.js';
import automatedIntakeService from '../../../services/intakeQueue/AutomatedIntakeService.js';
import groupMessageScanner from '../../../services/intakeQueue/GroupMessageScanner.js';
import connectorRegistry from '../../../services/intakeConnectors/ConnectorRegistry.js';
import dealVerificationAgent from '../../../services/intakeVerification/DealVerificationAgent.js';

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
        const matchStage = {};
        if (req.user && req.user.tenantId) {
            matchStage.tenantId = new mongoose.Types.ObjectId(req.user.tenantId);
        }
        if (req.query.source_type) {
            matchStage.source_type = req.query.source_type;
        }
        if (req.query.groupJid) {
            matchStage.$or = [
                { 'raw_source_data.groupJid': req.query.groupJid },
                { 'extracted_entities._whatsappGroup.groupJid': req.query.groupJid }
            ];
        }

        const limit = Math.min(parseInt(req.query.limit) || 100, 500);

        const pipeline = [];
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }
        
        pipeline.push(
            { $sort: { receivedAt: -1 } },
            { $limit: limit },
            {
                $addFields: {
                    contentSnippet: {
                        $cond: {
                            if: { $eq: [{ $type: "$content" }, "string"] },
                            then: { $substrCP: ["$content", 0, 150] },
                            else: ""
                        }
                    }
                }
            },
            { $project: { content: 0 } }
        );

        const intakes = await Intake.aggregate(pipeline);
        
        // Ensure id property is present for frontend compatibility & compute duplicate category
        // Dynamic 30-day window duplicate cluster resolution:
        const textClusters = new Map();
        intakes.forEach(item => {
            const raw = (item.raw_source_data?.text || item.description || item.contentSnippet || '').trim().toLowerCase();
            const phone = (item.contact_numbers && item.contact_numbers[0]) ? String(item.contact_numbers[0]).replace(/\D/g, '').slice(-10) : '';
            const key = raw.length > 20 ? raw.substring(0, 100) : (phone ? `phone_${phone}` : null);
            if (key) {
                if (!textClusters.has(key)) textClusters.set(key, []);
                textClusters.get(key).push(item);
            }
        });

        intakes.forEach(item => {
            item.id = item._id.toString();
            const raw = (item.raw_source_data?.text || item.description || item.contentSnippet || '').trim().toLowerCase();
            const phone = (item.contact_numbers && item.contact_numbers[0]) ? String(item.contact_numbers[0]).replace(/\D/g, '').slice(-10) : '';
            const key = raw.length > 20 ? raw.substring(0, 100) : (phone ? `phone_${phone}` : null);
            
            let dupCount = (item.duplicate_intelligence?.possible_duplicate_ids || []).length;
            if (dupCount === 0 && key && textClusters.has(key)) {
                dupCount = textClusters.get(key).length - 1;
            }

            if (dupCount === 1) item.category = 'repeat1x';
            else if (dupCount === 2) item.category = 'repeat2x';
            else if (dupCount === 3) item.category = 'repeat3x';
            else if (dupCount >= 4) item.category = 'repeat3plus';
            else item.category = 'new';
        });
        
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
        const query = { _id: req.params.id };
        if (req.user && req.user.tenantId) {
            query.tenantId = req.user.tenantId;
        }
        const intake = await Intake.findOne(query);
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

        const query = { _id: id };
        if (req.user && req.user.tenantId) {
            query.tenantId = req.user.tenantId;
        }
        const intake = await Intake.findOneAndUpdate(query, { status }, { new: true });
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
        
        const rawData = { text: content, source, campaignName };
        if (req.user && req.user.tenantId) {
            rawData.tenantId = req.user.tenantId;
        }
        // Directly push to the new Queue architecture
        const result = await addToIntakeQueue('manual', rawData, req.user?._id || req.user?.id);
        
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
        const query = { _id: id };
        if (req.user && req.user.tenantId) {
            query.tenantId = req.user.tenantId;
        }
        const intake = await Intake.findOneAndDelete(query);
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

        const payload = {
            filePath: req.file.path,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype
        };
        if (req.user && req.user.tenantId) {
            payload.tenantId = req.user.tenantId;
        }
        const result = await addToIntakeQueue('zip', payload, req.user?._id || req.user?.id);

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

        const payload = {
            filePath: req.file.path,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype
        };
        if (req.user && req.user.tenantId) {
            payload.tenantId = req.user.tenantId;
        }
        const result = await addToIntakeQueue('pdf', payload, req.user?._id || req.user?.id);

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

        const payload = {
            url: urlToProcess,
            source: source
        };
        if (req.user && req.user.tenantId) {
            payload.tenantId = req.user.tenantId;
        }
        const result = await addToIntakeQueue(source_type, payload, req.user?._id || req.user?.id);

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

        const payload = {
            url: urlToProcess,
            source,
            frequency,
            createdBy: req.user?._id || req.user?.id
        };
        if (req.user && req.user.tenantId) {
            payload.tenantId = req.user.tenantId;
        }
        const automatedSource = await AutomatedIntakeSource.create(payload);

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
        const query = { createdBy: req.user?._id || req.user?.id };
        if (req.user && req.user.tenantId) {
            query.tenantId = req.user.tenantId;
        }
        const sources = await AutomatedIntakeSource.find(query).sort({ createdAt: -1 });
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
        const query = { _id: id, createdBy: req.user?._id || req.user?.id };
        if (req.user && req.user.tenantId) {
            query.tenantId = req.user.tenantId;
        }
        const source = await AutomatedIntakeSource.findOne(query);

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
        const query = { _id: id, createdBy: req.user?._id || req.user?.id };
        if (req.user && req.user.tenantId) {
            query.tenantId = req.user.tenantId;
        }
        const source = await AutomatedIntakeSource.findOneAndDelete(query);

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

/**
 * Get all WhatsApp group intake cursors and statistics
 */
export const getIntakeGroups = async (req, res) => {
    try {
        const groups = await IntakeGroupCursor.find({})
            .sort({ totalProcessed: -1, updatedAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            data: groups,
            scannerHealth: groupMessageScanner.getHealth()
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Toggle active status for a WhatsApp group intake cursor
 */
export const toggleIntakeGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const group = await IntakeGroupCursor.findById(id);

        if (!group) {
            return res.status(404).json({ success: false, message: 'Group cursor not found' });
        }

        group.is_active = !group.is_active;
        if (!group.is_active) {
            group.deactivation_reason = req.body?.reason || 'Manually disabled by admin';
        } else {
            group.deactivation_reason = null;
        }
        await group.save();

        res.status(200).json({
            success: true,
            message: `Group intake ${group.is_active ? 'enabled' : 'disabled'} for ${group.groupName || group.groupJid}`,
            data: group
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Manually trigger group message scan
 */
export const triggerGroupScan = async (req, res) => {
    try {
        // Run scan asynchronously to avoid HTTP timeout
        groupMessageScanner.triggerNow().catch(err => {
            console.error('[triggerGroupScan] Background scan error:', err);
        });

        res.status(200).json({
            success: true,
            message: 'WhatsApp group scan triggered in background'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Backfill historical messages for a group (resets cursor to -1 and triggers scan)
 */
export const backfillIntakeGroup = async (req, res) => {
    try {
        const { id } = req.params;
        let query = {};
        if (id && id !== 'all') {
            query._id = id;
        }

        const updateResult = await IntakeGroupCursor.updateMany(query, {
            $set: { lastProcessedIndex: -1, is_active: true }
        });

        // Trigger scan
        groupMessageScanner.triggerNow().catch(err => {
            console.error('[backfillIntakeGroup] Background scan error:', err);
        });

        res.status(200).json({
            success: true,
            message: `Backfill initiated for ${updateResult.modifiedCount} group(s). Cursor reset to beginning.`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Preview WhatsApp Verification Inquiry
 * Generates Hinglish inquiry draft using Gemini Flash & resolves target phone numbers.
 */
export const previewWAVerification = async (req, res) => {
    try {
        const { id } = req.params;
        const intake = await Intake.findById(id);

        if (!intake) {
            return res.status(404).json({ success: false, message: "Intake record not found" });
        }

        const targetPhones = dealVerificationAgent.resolveTargetPhones(intake);
        const draftMessage = await dealVerificationAgent.generateInquiryDraft(intake);

        res.status(200).json({
            success: true,
            targetPhones,
            draftMessage,
            wa_verification: intake.wa_verification || { status: 'idle' }
        });
    } catch (error) {
        console.error('[previewWAVerification Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Send WhatsApp Verification Inquiry
 * Sends the inquiry message to target broker via WhatsApp Web (Baileys).
 */
export const sendWAVerification = async (req, res) => {
    try {
        const { id } = req.params;
        const { targetPhone, targetType, message, provider } = req.body;

        if (!targetPhone) {
            return res.status(400).json({ success: false, message: "targetPhone is required" });
        }

        if (!message) {
            return res.status(400).json({ success: false, message: "message content is required" });
        }

        const result = await dealVerificationAgent.sendVerificationInquiry(id, {
            targetPhone,
            targetType,
            message,
            provider: provider || 'BAILEYS',
            userId: req.user?._id || req.user?.id
        });

        res.status(200).json({
            success: true,
            message: `WhatsApp verification inquiry sent successfully via ${result.provider || 'WhatsApp'}`,
            data: result
        });
    } catch (error) {
        console.error('[sendWAVerification Error]:', error.message);
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get WhatsApp Verification Live Status & Extracted Entities
 */
export const getWAVerificationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const intake = await Intake.findById(id).select('wa_verification verification_status confidence_score extracted_entities location price');

        if (!intake) {
            return res.status(404).json({ success: false, message: "Intake record not found" });
        }

        res.status(200).json({
            success: true,
            wa_verification: intake.wa_verification || { status: 'idle' },
            verification_status: intake.verification_status,
            confidence_score: intake.confidence_score,
            extracted_entities: intake.extracted_entities
        });
    } catch (error) {
        console.error('[getWAVerificationStatus Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};



