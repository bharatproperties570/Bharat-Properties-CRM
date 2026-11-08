import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Allowed MIME types across the entire Application
const ALLOWED_MIME_TYPES = {
    // Images
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
    // Documents
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/msword': ['.doc'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'text/csv': ['.csv'],
    'text/plain': ['.txt'],
    // Videos
    'video/mp4': ['.mp4', '.m4v'],
    'video/quicktime': ['.mov', '.mp4'],
    'video/x-m4v': ['.m4v', '.mp4'],
    'video/3gpp': ['.3gp', '.3gpp'],
    'video/3gpp2': ['.3g2'],
    'video/webm': ['.webm'],
    'video/x-msvideo': ['.avi'],
    'video/mpeg': ['.mpeg', '.mpg'],
    // Archives
    'application/zip': ['.zip'],
    'application/x-zip-compressed': ['.zip'],
    'application/x-zip': ['.zip'],
    'application/octet-stream': ['.zip', '.csv', '.txt', '.mp4', '.mov', '.pdf', '.png', '.jpg', '.jpeg'],
    // GIS / Maps
    'application/vnd.google-earth.kml+xml': ['.kml'],
    'application/geo+json': ['.geojson'],
    'application/json': ['.geojson']
};

import os from 'os';

const getUploadDir = () => {
    try {
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads', { recursive: true });
        }
        return 'uploads/';
    } catch (e) {
        console.warn('[Multer] uploads/ is not writeable. Falling back to OS temp directory.');
        return os.tmpdir();
    }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, getUploadDir());
    },
    filename: (req, file, cb) => {
        // Prevent Path traversal & overwrite attacks
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizeFilename = file.originalname.replace(/[^a-zA-Z0-9_\-.]/g, '');
        cb(null, file.fieldname + '-' + uniqueSuffix + '-' + sanitizeFilename);
    }
});

/**
 * Factory wrapper to generate strict Multer Middlewares
 */
const createUploader = (allowedTypes, maxMb = 25) => {
    return multer({
        storage,
        limits: { fileSize: maxMb * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();

            // 1. Direct validation: Matches recognized MIME and exact extension matches
            if (allowedTypes[file.mimetype] && allowedTypes[file.mimetype].includes(ext)) {
                return cb(null, true);
            }

            // 2. Cross-platform browser fallback for video types
            // (e.g. Safari reporting video/quicktime or application/octet-stream for .mp4, or empty MIME)
            const validVideoExts = ['.mp4', '.mov', '.m4v', '.3gp', '.3gpp', '.webm', '.avi'];
            const acceptsVideo = allowedTypes['video/mp4'] || allowedTypes['video/quicktime'] || allowedTypes['application/octet-stream'];
            if (acceptsVideo && validVideoExts.includes(ext)) {
                if (!file.mimetype || file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream') {
                    return cb(null, true);
                }
            }

            // 3. Fallback for image types (e.g. image/pjpeg, image/x-png, octet-stream for images)
            const validImageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
            const acceptsImage = allowedTypes['image/jpeg'] || allowedTypes['image/png'];
            if (acceptsImage && validImageExts.includes(ext)) {
                if (!file.mimetype || file.mimetype.startsWith('image/') || file.mimetype === 'application/octet-stream') {
                    return cb(null, true);
                }
            }

            // 4. Fallback for document types (e.g. application/octet-stream for .pdf)
            const validDocExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'];
            const acceptsDoc = allowedTypes['application/pdf'] || allowedTypes['text/csv'];
            if (acceptsDoc && validDocExts.includes(ext)) {
                if (!file.mimetype || file.mimetype === 'application/octet-stream' || file.mimetype === 'application/pdf') {
                    return cb(null, true);
                }
            }

            cb(new Error(`Validation failed: Disallowed file type or extension mismatch. MIME: ${file.mimetype || 'unknown'}, Ext: ${ext}`), false);
        }
    });
};

// Exports for Route usages
export const uploadGeneric = createUploader(ALLOWED_MIME_TYPES, 25);

export const uploadImageOnly = createUploader({
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp']
}, 10);

export const uploadZipOnly = createUploader({
    'application/zip': ['.zip'],
    'application/x-zip-compressed': ['.zip']
}, 25);

export const uploadPdfOnly = createUploader({
    'application/pdf': ['.pdf']
}, 20);

// 🛡️ Dedicated Quarantine Uploader for OCR (Gate 2R.12 Path Isolation)
const getQuarantineDir = () => {
    const qDir = path.resolve(process.cwd(), 'storage/intake/quarantine');
    if (!fs.existsSync(qDir)) {
        fs.mkdirSync(qDir, { recursive: true });
    }
    return qDir;
};

const ocrStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, getQuarantineDir());
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'staging_' + uniqueSuffix + ext);
    }
});

export const uploadOcrImage = multer({
    storage: ocrStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowed = {
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png'],
            'image/webp': ['.webp']
        };
        if (allowed[file.mimetype] && allowed[file.mimetype].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Validation failed: Disallowed image type. MIME: ${file.mimetype}, Ext: ${ext}`), false);
        }
    }
});

// ==========================================================
// Malware Protection Strategy Note:
// For enterprise-grade zero-day malware scanning, uploads should be 
// proxied through AWS S3 EventBridge -> Lambda running ClamAV,
// or rely on a dedicated ICAP API endpoint before finalizing save().
// ==========================================================
