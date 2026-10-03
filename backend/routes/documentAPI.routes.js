import express from 'express';
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { uploadGeneric } from "../src/middlewares/upload.middleware.js";
import {
    createDocument,
    listDocuments,
    createVersion,
    uploadContent,
    downloadContent,
    getDownloadUrl,
    deleteDocument
} from '../controllers/documentAPI.controller.js';

const router = express.Router();

// CRM Authorization boundary is universally applied
router.use(authenticate);

// 0. List Documents for Entity
router.get('/', listDocuments);

// 1. Create a logical Document + v1
router.post('/', createDocument);

// 2. Create a new Version on an existing Document
router.post('/:documentId/versions', createVersion);

// 3. Upload File Payload directly to Provider via CRM Memory (requires multer for small payloads or streaming)
router.post('/:documentId/upload', uploadGeneric.single('file'), uploadContent);

// 4. Download / Stream content securely
router.get('/:documentId/content', downloadContent);

// 5. Get presigned download URL
router.get('/:documentId/download-url', getDownloadUrl);

// 5. Logical Delete
router.delete('/:documentId', deleteDocument);

export default router;
