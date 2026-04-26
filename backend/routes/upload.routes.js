import express from 'express';
import { uploadGeneric } from '../src/middlewares/upload.middleware.js';
import { uploadFileToDrive } from '../services/drive.service.js';
import { authenticate } from "../src/middlewares/auth.middleware.js";
 
 const router = express.Router();
 
 // Apply authentication to all routes
 router.use(authenticate);

/**
 * @route   POST /api/upload
 * @desc    Upload documents/images/videos to Google Drive
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
            // We don't delete it here so it remains available
            const localUrl = `/uploads/${req.file.filename}`;
            
            return res.status(200).json({
                success: true,
                url: localUrl,
                downloadUrl: localUrl,
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                storage: 'local'
            });
        }
    } catch (error) {
        console.error('Upload Route Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/upload/multiple
 * @desc    Upload multiple files to Google Drive
 * @access  Private
 */
router.post('/multiple', uploadGeneric.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No files uploaded.' });
        }

        const { entityType, entityName, folderId, docCategory, docType } = req.body;
        const uploadPromises = req.files.map(file => uploadFileToDrive(file, { 
            entityType, 
            entityName, 
            folderId,
            docCategory,
            docType
        }));
        const results = await Promise.all(uploadPromises);

        const result = req.files.map((file, index) => ({
            url: results[index].url,
            fileId: results[index].id,
            downloadUrl: results[index].downloadUrl,
            fileName: file.originalname,
            mimeType: file.mimetype
        }));

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Multiple Upload Route Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
