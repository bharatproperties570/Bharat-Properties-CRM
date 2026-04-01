import express from 'express';
import { uploadGeneric } from '../src/middlewares/upload.middleware.js';
import { uploadFileToDrive } from '../services/drive.service.js';


const router = express.Router();

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
        const result = await uploadFileToDrive(req.file, { 
            entityType, 
            entityName, 
            folderId,
            docCategory,
            docType
        });

        res.status(200).json({
            success: true,
            url: result.url,
            fileId: result.id,
            downloadUrl: result.downloadUrl,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype
        });
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
