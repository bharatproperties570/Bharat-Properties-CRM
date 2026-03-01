import multer from 'multer';
import path from 'path';

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
    'video/mp4': ['.mp4'],
    'video/quicktime': ['.mov'],
    'video/x-msvideo': ['.avi'],
    // Archives
    'application/zip': ['.zip'],
    'application/x-zip-compressed': ['.zip']
};

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        // Prevent Path traversal & overwrite attacks
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizeFilename = file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, '');
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

            // Double validation: Matches recognized MIME and exact extension matches
            if (allowedTypes[file.mimetype] && allowedTypes[file.mimetype].includes(ext)) {
                cb(null, true);
            } else {
                cb(new Error(`Validation failed: Disallowed file type or extension mismatch. MIME: ${file.mimetype}, Ext: ${ext}`), false);
            }
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
}, 50);

export const uploadPdfOnly = createUploader({
    'application/pdf': ['.pdf']
}, 20);

// ==========================================================
// Malware Protection Strategy Note:
// For enterprise-grade zero-day malware scanning, uploads should be 
// proxied through AWS S3 EventBridge -> Lambda running ClamAV,
// or rely on a dedicated ICAP API endpoint before finalizing save().
// ==========================================================
