import { createWorker } from 'tesseract.js';
import fs from 'fs';
import JSZip from 'jszip';
import pdf from 'pdf-parse';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { parseContent } from './intakeParser.js';
import { canViewIntake, canClaimIntake } from './intake.authorization.js';
import Intake from '../../../models/Intake.js';
import IntakeGroupCursor from '../../../models/IntakeGroupCursor.js';
import AutomatedIntakeSource from '../../../models/AutomatedIntakeSource.js';
import { addToIntakeQueue, intakeQueue } from '../../../services/intakeQueue/IntakeQueue.js';
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

        // 🛡️ Gate 2R.12: Enforce Policy A Viewing Policy
        if (!canViewIntake(intake, req.user)) {
            return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to view this intake' });
        }

        res.status(200).json({ success: true, data: intake });
    } catch (error) {
        console.error("[Intake:GetById Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Claim an unassigned intake record (Gate 2R.12 Policy B)
 */
export const claimIntake = async (req, res) => {
    try {
        const { id } = req.params;
        const intake = await Intake.findById(id);
        if (!intake) return res.status(404).json({ success: false, message: 'Intake record not found' });

        // 🛡️ Gate 2R.12 Policy B: Claim Eligibility Check
        if (!canClaimIntake(intake, req.user)) {
            return res.status(403).json({ success: false, message: 'You are not eligible to claim this intake record' });
        }

        // Atomic claim execution
        const claimed = await Intake.findOneAndUpdate(
            {
                _id: id,
                createdBy: null,
                assignedTo: null,
                status: { $in: ['Raw Received', 'Queued', 'Needs Review', 'Ready for Review'] }
            },
            {
                $set: {
                    assignedTo: req.user._id,
                    claimedAt: new Date(),
                    'raw_source_data.claimedBy': req.user._id
                }
            },
            { new: true }
        );

        if (!claimed) {
            return res.status(409).json({ success: false, message: 'Conflict: Record already claimed or not eligible' });
        }

        res.status(200).json({ success: true, data: claimed });
    } catch (error) {
        console.error("[Intake:Claim Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get intake OCR image attachment with O_NOFOLLOW & parent directory validation (Gate 2R.12)
 */
export const getIntakeImage = async (req, res) => {
    try {
        const { id } = req.params;
        const intake = await Intake.findById(id);
        if (!intake) return res.status(404).json({ success: false, message: 'Intake record not found' });

        // 🛡️ Gate 2R.12: Enforce Policy A (identical to detail view!)
        if (!canViewIntake(intake, req.user)) {
            return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to view this image' });
        }

        const filePath = intake.raw_source_data?.storagePath;
        if (!filePath) {
            return res.status(404).json({ success: false, message: 'No image attachment registered for this intake' });
        }

        const resolvedFilePath = path.resolve(filePath);
        if (!fs.existsSync(resolvedFilePath)) {
            return res.status(404).json({ success: false, message: 'Image file not found on disk' });
        }

        // 🛡️ Gate 2R.12: O_NOFOLLOW Leaf Check & Canonical Directory Verification
        let fd;
        try {
            fd = fs.openSync(resolvedFilePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        } catch (openErr) {
            if (openErr.code === 'ELOOP') {
                console.error(`[SECURITY ALERT] Symlink blocked by O_NOFOLLOW: ${resolvedFilePath}`);
                return res.status(403).json({ success: false, message: 'Access denied: Symbolic links are strictly prohibited' });
            }
            throw openErr;
        }

        try {
            const stat = fs.fstatSync(fd);
            if (!stat.isFile()) {
                fs.closeSync(fd);
                return res.status(403).json({ success: false, message: 'Not a regular file' });
            }

            // Verify parent directory resides inside canonical permanent storage
            const canonicalParent = fs.realpathSync(path.dirname(resolvedFilePath));
            const storageOcrDir = path.resolve(process.cwd(), 'storage/intake/ocr');
            if (!fs.existsSync(storageOcrDir)) {
                fs.mkdirSync(storageOcrDir, { recursive: true });
            }
            const canonicalRoot = fs.realpathSync(storageOcrDir);

            if (canonicalParent !== canonicalRoot && !canonicalParent.startsWith(canonicalRoot + path.sep)) {
                fs.closeSync(fd);
                return res.status(403).json({ success: false, message: 'Access denied: File boundary violation' });
            }

            // Verify magic bytes directly from open file descriptor
            const magic = Buffer.alloc(12);
            fs.readSync(fd, magic, 0, 12, 0);

            let contentType = null;
            if (magic.subarray(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]))) contentType = 'image/jpeg';
            else if (magic.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) contentType = 'image/png';
            else if (magic.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) && magic.subarray(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]))) contentType = 'image/webp';
            else {
                fs.closeSync(fd);
                return res.status(415).json({ success: false, message: 'Unsupported file content format' });
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stat.size);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            const stream = fs.createReadStream(null, { fd, autoClose: true });
            stream.pipe(res);
        } catch (streamErr) {
            try { fs.closeSync(fd); } catch (e) {}
            throw streamErr;
        }
    } catch (error) {
        console.error("[Intake:GetImage Error]:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update intake status with archive retention & restore guards
 */
export const updateIntakeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const current = await Intake.findById(id);
        if (!current) return res.status(404).json({ success: false, message: 'Intake record not found' });

        const updateDoc = {
            $set: { status }
        };

        // 🛡️ Gate 2R.12: Archive Restoration Guard
        // If restoring from Archived to active review, block if actively purging
        if (current.status === 'Archived' && (status === 'Needs Review' || status === 'Ready for Review' || status === 'Queued')) {
            if (current.file_status === 'purging') {
                return res.status(409).json({ success: false, message: 'Cannot restore: Image purge is already in progress' });
            }
            if (current.file_status === 'purged') {
                return res.status(409).json({ success: false, message: 'Cannot restore: Image has already been purged' });
            }
            // Cancel pending deletion schedule
            updateDoc.$set.file_status = 'ready';
            updateDoc.$unset = { purgeScheduledAt: 1, archivedAt: 1 };
        }

        // 🛡️ Gate 2R.12: Confirmed 7-day Archive Retention Policy
        if (status === 'Archived' && current.status !== 'Archived') {
            updateDoc.$set.archivedAt = new Date();
            updateDoc.$set.purgeScheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Exactly 7 days approved
        }

        const query = { _id: id };
        if (req.user && req.user.tenantId) {
            query.tenantId = req.user.tenantId;
        }

        const intake = await Intake.findOneAndUpdate(query, updateDoc, { new: true });
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
 * Process OCR upload with Path-Isolation Protocol (Gate 2R.12 Workstream C)
 * Staged into quarantine -> verified -> moved to permanent -> pre-registered -> dispatched to BullMQ
 */
export const processOCR = async (req, res) => {
    try {
        if (!req.file) {
            console.warn("[Intake:OCR] No file in request.");
            return res.status(400).json({ success: false, message: "No image file uploaded" });
        }

        const quarantinePath = req.file.path;

        // 1. Verify magic bytes on quarantine file directly
        const fd = fs.openSync(quarantinePath, fs.constants.O_RDONLY);
        const magic = Buffer.alloc(12);
        fs.readSync(fd, magic, 0, 12, 0);
        fs.closeSync(fd);

        let validMime = null;
        if (magic.subarray(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]))) validMime = 'image/jpeg';
        else if (magic.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) validMime = 'image/png';
        else if (magic.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) && magic.subarray(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]))) validMime = 'image/webp';

        if (!validMime) {
            try { fs.unlinkSync(quarantinePath); } catch (e) {}
            return res.status(400).json({ success: false, message: "Invalid image content: must be genuine JPEG, PNG, or WebP" });
        }

        // 2. Compute SHA-256 hash of image payload
        const fileBuffer = fs.readFileSync(quarantinePath);
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // 3. Pre-register Intake in MongoDB with staged file_status
        const intake = new Intake({
            source: 'Camera',
            source_type: 'other',
            status: 'Queued',
            file_status: 'staged',
            department: req.user?.department || 'sales',
            createdBy: req.user?._id,
            raw_source_data: {
                originalName: req.file.originalname,
                mimeType: validMime,
                fileHash,
                quarantinePath
            },
            meta: {
                fileName: req.file.originalname,
                mimeType: validMime,
                fileHash
            }
        });
        await intake.save();

        // 4. Relocate file from quarantine to permanent storage (${intakeId}_${hash}.${ext})
        const permanentDir = path.resolve(process.cwd(), 'storage/intake/ocr');
        if (!fs.existsSync(permanentDir)) {
            fs.mkdirSync(permanentDir, { recursive: true });
        }
        const ext = path.extname(req.file.originalname).toLowerCase() || (validMime === 'image/png' ? '.png' : '.jpg');
        const permanentPath = path.resolve(permanentDir, `${intake._id}_${fileHash}${ext}`);

        fs.renameSync(quarantinePath, permanentPath);
        const now = new Date();
        fs.utimesSync(permanentPath, now, now); // 🛡️ Reset mtime to reflect permanent admission time

        // 5. Update Intake state to ready
        intake.file_status = 'ready';
        intake.raw_source_data.storagePath = permanentPath;
        await intake.save();

        // 6. Enqueue to BullMQ with deterministic jobId
        try {
            await intakeQueue.add('process-intake', {
                intakeId: intake._id,
                sourceType: 'ocr',
                rawData: {
                    filePath: permanentPath,
                    fileHash,
                    originalName: req.file.originalname,
                    mimeType: validMime
                },
                userId: req.user?._id
            }, {
                jobId: `ocr_${intake._id}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 }
            });
        } catch (queueErr) {
            console.warn(`[Intake:OCR] BullMQ enqueue deferred (${queueErr.message}). Intake saved in MongoDB under 'Queued' status.`);
        }

        res.status(202).json({
            success: true,
            message: "OCR queued for background processing",
            data: intake,
            intakeId: intake._id
        });
    } catch (error) {
        console.error("[Intake:OCR Error]:", error);
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        res.status(500).json({ success: false, message: error.message || "OCR Admission Failed" });
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
        const WhatsAppAccountAuthorizationService = (await import('../../../services/WhatsAppAccountAuthorizationService.js')).default;
        const isSuperAdmin = WhatsAppAccountAuthorizationService.isAdmin(req.user) || req.user?.dataScope === 'all';

        let groupFilter = {};
        if (!isSuperAdmin && req.user) {
            const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../../../models/WhatsAppIntegration.js')).default;
            const userIntegrations = await WhatsAppIntegration.find({
                status: 'ACTIVE',
                $or: [
                    { connectedBy: req.user._id },
                    { allowedUsers: req.user._id }
                ]
            }).select('_id').lean();
            const allowedIntegIds = userIntegrations.map(i => i._id);

            groupFilter = {
                whatsappIntegrationId: { $in: allowedIntegIds }
            };
        }

        const groups = await IntakeGroupCursor.find(groupFilter)
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
 * Also resolves the authorized outbound WhatsApp lines (WhatsApp Web & Meta API) for the requesting user.
 */
export const previewWAVerification = async (req, res) => {
    try {
        const { id } = req.params;
        const intake = await Intake.findById(id);

        if (!intake) {
            return res.status(404).json({ success: false, message: "Intake record not found" });
        }

        const targetPhones = await dealVerificationAgent.resolveTargetPhones(intake);
        const draftMessage = await dealVerificationAgent.generateInquiryDraft(intake);

        // 🛡️ Enterprise AI Agent Metadata Resolution
        let activeAgentInfo = null;
        try {
            const AiAgent = mongoose.models.AiAgent || (await import('../../../models/AiAgent.js')).default;
            const ag = await AiAgent.findOne({ useCases: 'intake_verification', isActive: true }).select('name role provider modelName').lean();
            if (ag) {
                activeAgentInfo = {
                    id: ag._id.toString(),
                    name: ag.name,
                    role: ag.role,
                    provider: ag.provider,
                    modelName: ag.modelName
                };
            }
        } catch (e) {}

        // 🛡️ Enterprise Outbound WhatsApp Line Resolution:
        // Strictly resolve active WhatsApp accounts authorized for the requesting user
        let baileysAccount = null;
        let metaAccount = null;

        try {
            const WhatsAppAccountAuthorizationService = (await import('../../../services/WhatsAppAccountAuthorizationService.js')).default;
            const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../../../models/WhatsAppIntegration.js')).default;

            let userIntegrations = [];
            if (req.user) {
                const allActive = await WhatsAppIntegration.find({ status: 'ACTIVE' }).lean();
                userIntegrations = WhatsAppAccountAuthorizationService.filterAuthorizedAccounts(req.user, allActive);
            }

            baileysAccount = userIntegrations.find(a => a.provider === 'BAILEYS' || a.connectionType === 'QR_SCANNER') || null;
            metaAccount = userIntegrations.find(a => a.provider === 'META' || a.connectionType === 'NEW_API' || a.connectionType === 'COEXISTENCE') || null;
        } catch (authErr) {
            console.warn('[previewWAVerification] Outbound line resolution warning:', authErr.message);
        }

        res.status(200).json({
            success: true,
            targetPhones,
            draftMessage,
            activeAgent: activeAgentInfo,
            wa_verification: intake.wa_verification || { status: 'idle' },
            outboundLines: {
                baileys: baileysAccount ? {
                    id: baileysAccount._id.toString(),
                    phoneNumberId: baileysAccount.phoneNumberId,
                    displayPhoneNumber: baileysAccount.displayPhoneNumber,
                    label: `WhatsApp Web (${baileysAccount.displayPhoneNumber}) - Peer Line (Recommended)`
                } : null,
                meta: metaAccount ? {
                    id: metaAccount._id.toString(),
                    phoneNumberId: metaAccount.phoneNumberId,
                    displayPhoneNumber: metaAccount.displayPhoneNumber,
                    label: `Meta Official API (${metaAccount.displayPhoneNumber})`
                } : {
                    id: 'legacy_default',
                    displayPhoneNumber: '+91 99960 00570',
                    label: 'Meta Official API (+91 99960 00570)'
                }
            }
        });
    } catch (error) {
        console.error('[previewWAVerification Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Send WhatsApp Verification Inquiry
 * Sends the inquiry message to target broker via WhatsApp Web (Baileys) or Meta Cloud API.
 * Strictly verifies and routes to the logged-in user's personal WhatsApp Web session.
 */
export const sendWAVerification = async (req, res) => {
    try {
        const { id } = req.params;
        const { targetPhone, targetType, message, provider, integrationId } = req.body;

        if (!targetPhone) {
            return res.status(400).json({ success: false, message: "targetPhone is required" });
        }

        if (!message) {
            return res.status(400).json({ success: false, message: "message content is required" });
        }

        const isMeta = String(provider || '').toUpperCase() === 'META';

        // 🛡️ Enterprise Per-User WhatsApp Web Security Gate:
        let resolvedIntegrationId = integrationId;
        if (!isMeta) {
            const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../../../models/WhatsAppIntegration.js')).default;
            const WhatsAppAccountAuthorizationService = (await import('../../../services/WhatsAppAccountAuthorizationService.js')).default;

            const allActive = await WhatsAppIntegration.find({ status: 'ACTIVE', provider: 'BAILEYS' }).lean();
            const userAllowedBaileys = WhatsAppAccountAuthorizationService.filterAuthorizedAccounts(req.user, allActive);

            if (!userAllowedBaileys || userAllowedBaileys.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have an active WhatsApp Web connection linked to your account. Please scan your WhatsApp Web QR code in Profile settings first."
                });
            }

            if (!resolvedIntegrationId) {
                // If intake has a specific whatsappIntegrationId from the originating group, prefer that line if authorized
                const intakeRecord = await Intake.findById(id).select('whatsappIntegrationId raw_source_data extracted_entities').lean();
                let sourceLineId = intakeRecord?.whatsappIntegrationId || intakeRecord?.raw_source_data?.whatsappIntegrationId;
                
                if (!sourceLineId && (intakeRecord?.raw_source_data?.conversationId || intakeRecord?.extracted_entities?._whatsappGroup?.conversationId)) {
                    try {
                        const Conversation = (await import('../../../models/Conversation.js')).default;
                        const c = await Conversation.findById(intakeRecord.raw_source_data?.conversationId || intakeRecord.extracted_entities?._whatsappGroup?.conversationId).select('whatsappIntegrationId').lean();
                        if (c?.whatsappIntegrationId) sourceLineId = c.whatsappIntegrationId;
                    } catch (e) {}
                }

                if (sourceLineId) {
                    const matchIntakeLine = userAllowedBaileys.find(b => b._id.toString() === sourceLineId.toString());
                    if (matchIntakeLine) {
                        resolvedIntegrationId = matchIntakeLine._id.toString();
                    }
                }
            }

            if (resolvedIntegrationId) {
                const match = userAllowedBaileys.find(b => b._id.toString() === resolvedIntegrationId.toString());
                if (!match) {
                    return res.status(403).json({
                        success: false,
                        message: "Unauthorized WhatsApp Web line. You can only dispatch verification inquiries from your own connected WhatsApp Web session."
                    });
                }
            } else {
                resolvedIntegrationId = userAllowedBaileys[0]._id.toString();
            }
        }

        // 🚀 ENTERPRISE DEV-TO-PROD WHATSAPP WEB BRIDGE:
        // In local development, the Baileys socket is intentionally not connected to prevent session
        // conflicts with 24/7 production group scanner on api.bharatproperties.co.
        // If the user triggers WhatsApp Web dispatch in local dev, bridge seamlessly to Production EC2!
        if (!isMeta && process.env.NODE_ENV !== 'production') {
            try {
                const { BaileysConnectionManager } = await import('../../../services/baileysQueue/BaileysConnectionManager.js');
                const sock = BaileysConnectionManager.getSocket(resolvedIntegrationId);
                const isSocketLive = sock && sock.ws && sock.ws.isOpen;

                if (!isSocketLive) {
                    console.log(`[sendWAVerification] 🔄 Local Baileys socket inactive in dev. Bridging inquiry to Production EC2 (api.bharatproperties.co)...`);
                    const jwt = (await import('jsonwebtoken')).default;
                    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || jwt.sign(
                        { id: req.user?._id || req.user?.id || '69c36289974fbf7946ee99cd', role: 'admin' },
                        process.env.JWT_SECRET || 'supersecretkey123',
                        { expiresIn: '15m' }
                    );

                    const prodResponse = await fetch(`https://api.bharatproperties.co/api/intake/${id}/wa-verification-send`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ targetPhone, targetType, message, provider: 'BAILEYS', integrationId: resolvedIntegrationId })
                    });

                    const prodJson = await prodResponse.json();
                    if (!prodResponse.ok || !prodJson.success) {
                        throw new Error(prodJson.message || prodJson.error || 'Production WhatsApp Web bridge returned an error');
                    }

                    console.log(`[sendWAVerification] ✅ Bridged dispatch succeeded:`, prodJson.data?.messageId || prodJson.data?.status);
                    return res.status(200).json(prodJson);
                }
            } catch (bridgeErr) {
                console.error(`[sendWAVerification] Dev bridge failed:`, bridgeErr.message);
                throw bridgeErr;
            }
        }

        const result = await dealVerificationAgent.sendVerificationInquiry(id, {
            targetPhone,
            targetType,
            message,
            provider: provider || 'BAILEYS',
            userId: req.user?._id || req.user?.id,
            integrationId: resolvedIntegrationId
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

/**
 * 🛡️ Get Auto-Verification Anti-Ban Settings & Metrics
 */
export const getAutoVerificationSettings = async (req, res) => {
    try {
        const AutoVerificationSettings = (await import('../../../models/AutoVerificationSettings.js')).default;
        const settings = await AutoVerificationSettings.getSettings();

        // Get count of queued verification jobs
        let queuedCount = 0;
        try {
            const { autoVerificationQueue } = await import('../../../services/intakeVerification/AutoVerificationDispatcher.js');
            queuedCount = await autoVerificationQueue.getWaitingCount();
        } catch (e) {}

        res.status(200).json({
            success: true,
            settings,
            metrics: {
                dailySentCount: settings.dailySentCount || 0,
                dailyLimit: settings.dailyLimit || 35,
                queuedCount,
                circuitBreakerTripped: !!settings.circuitBreakerTripped,
                circuitBreakerReason: settings.circuitBreakerReason || null
            }
        });
    } catch (error) {
        console.error('[getAutoVerificationSettings Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 🛡️ Update Auto-Verification Settings
 */
export const updateAutoVerificationSettings = async (req, res) => {
    try {
        const AutoVerificationSettings = (await import('../../../models/AutoVerificationSettings.js')).default;
        const settings = await AutoVerificationSettings.getSettings();

        const allowedFields = [
            'isEnabled', 'confidenceThreshold', 'requireSaleIntentOnly',
            'cooldownHoursPerBroker', 'dailyLimit', 'businessHoursStart',
            'businessHoursEnd', 'minDelaySeconds', 'maxDelaySeconds',
            'simulateTypingSeconds', 'includeOptOutCourtesy', 'optOutCourtesyText'
        ];

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                settings[field] = req.body[field];
            }
        });

        settings.updatedBy = req.user?._id || req.user?.id;
        await settings.save();

        res.status(200).json({
            success: true,
            message: "Auto-verification settings updated successfully",
            settings
        });
    } catch (error) {
        console.error('[updateAutoVerificationSettings Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 🛡️ Reset Safety Circuit Breaker
 */
export const resetAutoVerificationCircuitBreaker = async (req, res) => {
    try {
        const { default: autoVerificationDispatcher } = await import('../../../services/intakeVerification/AutoVerificationDispatcher.js');
        const updated = await autoVerificationDispatcher.resetCircuitBreaker();

        res.status(200).json({
            success: true,
            message: "Circuit breaker successfully reset. Auto-dispatch resumed.",
            settings: updated
        });
    } catch (error) {
        console.error('[resetAutoVerificationCircuitBreaker Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};



