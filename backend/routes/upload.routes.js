import express from 'express';
import fs from 'fs';
import path from 'path';
import { uploadGeneric } from '../src/middlewares/upload.middleware.js';
import { uploadFileToDrive, deleteFileFromDrive, getFileMetadata } from '../services/drive.service.js';
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   POST /api/upload
 * @desc    Upload documents/images/videos to Google Drive with local fallback
 * @access  Private
 */
router.post('/', uploadGeneric.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded.' });
        }

        const { entityType, entityName, folderId, docCategory, docType } = req.body;
        
        try {
            // Attempt Google Drive Upload
            const result = await uploadFileToDrive(req.file, { 
                entityType, 
                entityName, 
                folderId,
                docCategory,
                docType
            });

            return res.status(200).json({
                success: true,
                url: result.url,
                fileId: result.id,
                downloadUrl: result.downloadUrl,
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                storage: 'google_drive'
            });
        } catch (driveError) {
            console.warn('[UploadRoute] Google Drive upload failed, falling back to LOCAL storage:', driveError.message);
            
            // Fallback: Return local URL (the file is already saved in uploads/ by multer)
            const localUrl = `/uploads/${req.file.filename}`;
            
            return res.status(200).json({
                success: true,
                url: localUrl,
                fileId: req.file.filename,
                downloadUrl: localUrl,
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                storage: 'local'
            });
        }
    } catch (error) {
        console.error('Upload Route Error:', error.message);
        // Clean up the uploaded file if we failed completely (e.g. invalid request parameters)
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkErr) {
                console.error('Failed to delete temp file on route error:', unlinkErr.message);
            }
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/upload/multiple
 * @desc    Upload multiple files with per-file Google Drive & local fallback
 * @access  Private
 */
router.post('/multiple', uploadGeneric.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No files uploaded.' });
        }

        const { entityType, entityName, folderId, docCategory, docType } = req.body;

        const results = await Promise.all(req.files.map(async (file) => {
            try {
                const driveRes = await uploadFileToDrive(file, {
                    entityType,
                    entityName,
                    folderId,
                    docCategory,
                    docType
                });
                return {
                    success: true,
                    url: driveRes.url,
                    fileId: driveRes.id,
                    downloadUrl: driveRes.downloadUrl,
                    fileName: file.originalname,
                    mimeType: file.mimetype,
                    storage: 'google_drive'
                };
            } catch (driveErr) {
                console.warn(`[UploadRoute] Multiple upload: Drive failed for ${file.originalname}, falling back to LOCAL:`, driveErr.message);
                const localUrl = `/uploads/${file.filename}`;
                return {
                    success: true,
                    url: localUrl,
                    fileId: file.filename,
                    downloadUrl: localUrl,
                    fileName: file.originalname,
                    mimeType: file.mimetype,
                    storage: 'local'
                };
            }
        }));

        res.status(200).json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Multiple Upload Route Error:', error.message);
        // Clean up all local files from the failed batch
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (file.path && fs.existsSync(file.path)) {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (unlinkErr) {}
                }
            });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   DELETE /api/upload/:fileId
 * @desc    Delete a document from Google Drive or local storage
 * @access  Private
 */
router.delete('/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).json({ success: false, error: 'File ID is required.' });
        }

        // Sanitize to prevent path traversal on local checks
        const sanitized = path.basename(fileId);
        const localPath = path.join(process.cwd(), 'uploads', sanitized);

        if (fs.existsSync(localPath)) {
            try {
                fs.unlinkSync(localPath);
                return res.status(200).json({
                    success: true,
                    message: `Local file ${sanitized} deleted successfully.`,
                    storage: 'local'
                });
            } catch (unlinkErr) {
                console.error(`[UploadRoute] Failed to delete local file ${sanitized}:`, unlinkErr.message);
                return res.status(500).json({ success: false, error: unlinkErr.message });
            }
        }

        // Otherwise attempt Google Drive deletion
        try {
            const driveResult = await deleteFileFromDrive(fileId);
            return res.status(200).json({
                success: true,
                message: driveResult.message,
                storage: 'google_drive'
            });
        } catch (driveErr) {
            console.error(`[UploadRoute] Drive deletion failed for ${fileId}:`, driveErr.message);
            return res.status(500).json({
                success: false,
                error: `Failed to delete file from storage: ${driveErr.message}`
            });
        }
    } catch (error) {
        console.error('Delete Route Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/upload/metadata/:fileId
 * @desc    Get document metadata from Google Drive or local storage
 * @access  Private
 */
router.get('/metadata/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).json({ success: false, error: 'File ID is required.' });
        }

        const sanitized = path.basename(fileId);
        const localPath = path.join(process.cwd(), 'uploads', sanitized);

        if (fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath);
            return res.status(200).json({
                success: true,
                data: {
                    fileId: sanitized,
                    fileName: sanitized,
                    size: stats.size,
                    createdTime: stats.birthtime,
                    modifiedTime: stats.mtime,
                    storage: 'local',
                    url: `/uploads/${sanitized}`
                }
            });
        }

        // Try Google Drive
        try {
            const metadata = await getFileMetadata(fileId);
            return res.status(200).json({
                success: true,
                data: metadata
            });
        } catch (driveErr) {
            return res.status(404).json({
                success: false,
                error: `Document not found in storage: ${driveErr.message}`
            });
        }
    } catch (error) {
        console.error('Metadata Route Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
