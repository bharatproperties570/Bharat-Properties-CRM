export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB aligned with existing generic upload limit

// Conservative baseline for CRM business documents
export const ALLOWED_DOCUMENT_MIME_TYPES = {
    // Documents
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/msword': ['.doc'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'text/csv': ['.csv'],
    'text/plain': ['.txt'],
    // Images
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png']
};

/**
 * Validate MIME type against conservative CRM document policy.
 * @param {string} mimeType 
 * @param {string} originalFilename 
 * @returns {boolean}
 */
export const validateMimeType = (mimeType, originalFilename) => {
    if (!mimeType || !originalFilename) return false;
    const allowedExtensions = ALLOWED_DOCUMENT_MIME_TYPES[mimeType];
    if (!allowedExtensions) return false;

    const ext = originalFilename.slice((originalFilename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
    return allowedExtensions.includes(`.${ext}`);
};

/**
 * Validate File Size against hard architectural maximum.
 * @param {number} sizeBytes 
 * @returns {boolean}
 */
export const validateFileSize = (sizeBytes) => {
    if (typeof sizeBytes !== 'number' || sizeBytes <= 0) return false;
    return sizeBytes <= MAX_DOCUMENT_SIZE_BYTES;
};
