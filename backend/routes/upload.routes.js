import express from 'express';
import multer from 'multer';
import { uploadFileToDrive } from '../services/drive.service.js';
import path from 'path';

const router = express.Router();

// Configure multer for temporary memory storage
// We use a temp directory which is then cleaned up by the service
const upload = multer({ dest: 'uploads/' });

/**
 * @route   POST /api/upload
 * @desc    Upload documents/images/videos to Google Drive
 * @access  Private
 */
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded.' });
        }

        const fileLink = await uploadFileToDrive(req.file);

        res.status(200).json({
            success: true,
            url: fileLink,
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
router.post('/multiple', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No files uploaded.' });
        }

        const uploadPromises = req.files.map(file => uploadFileToDrive(file));
        const fileLinks = await Promise.all(uploadPromises);

        const result = req.files.map((file, index) => ({
            url: fileLinks[index],
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
