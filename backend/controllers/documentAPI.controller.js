import DocumentService from '../services/storage/DocumentService.js';
import GoogleDriveStorageAdapter from '../services/storage/adapters/GoogleDriveStorageAdapter.js';
import { StorageError, ObjectNotFoundError, ObjectConflictError, ProviderUnavailableError, CapabilityNotSupportedError } from '../services/storage/StorageErrors.js';
import { AccessDeniedError, LifecycleRestrictionError } from '../services/storage/DocumentAccessService.js';
import mongoose from 'mongoose';
import path from 'path';

// Map domain errors to HTTP responses
const handleDomainError = (res, error) => {
    if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ success: false, error: 'Document not found or unauthorized' });
    }
    if (error instanceof AccessDeniedError) {
        return res.status(404).json({ success: false, error: 'Document not found or unauthorized' }); // Generic 404 for IDOR protection
    }
    if (error instanceof LifecycleRestrictionError) {
        return res.status(409).json({ success: false, error: error.message });
    }
    if (error instanceof ObjectConflictError) {
        return res.status(409).json({ success: false, error: 'Conflict' });
    }
    if (error instanceof ProviderUnavailableError) {
        return res.status(503).json({ success: false, error: 'Storage provider unavailable' });
    }
    if (error instanceof CapabilityNotSupportedError) {
        return res.status(501).json({ success: false, error: 'Operation capability is not supported by the underlying storage provider.' });
    }
    if (error.name === 'PolicyViolationError') {
        return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof StorageError) {
        return res.status(500).json({ success: false, error: 'Internal Storage Error' });
    }
    console.error('[DocumentAPI]', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
};

// Assuming DI will inject this in a real router, but for controller pattern:
let _documentService = null;
const getService = () => {
    if (!_documentService) _documentService = new DocumentService();
    return _documentService;
};

export const createDocument = async (req, res) => {
    try {
        const result = await getService().createDocument(req.user, req.body);
        return res.status(201).json({ success: true, data: result });
    } catch (err) {
        return handleDomainError(res, err);
    }
};

export const createVersion = async (req, res) => {
    try {
        const { documentId } = req.params;
        const result = await getService().createDocumentVersion(req.user, documentId, req.body);
        return res.status(201).json({ success: true, data: result });
    } catch (err) {
        return handleDomainError(res, err);
    }
};

export const uploadContent = async (req, res) => {
    try {
        const { documentId } = req.params;
        const { versionId } = req.body; // or req.query
        
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        // We use req.file.buffer if using multer memoryStorage, or stream if using custom streaming
        const streamOrBuffer = req.file.buffer || require('fs').createReadStream(req.file.path);
        const mimeType = req.file.mimetype;
        const sizeBytes = req.file.size;
        const originalFilename = req.file.originalname;

        const result = await getService().uploadFile(req.user, documentId, versionId, streamOrBuffer, mimeType, sizeBytes, originalFilename);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return handleDomainError(res, err);
    }
};


export const getDownloadUrl = async (req, res) => {
    try {
        const { documentId } = req.params;
        const { versionId } = req.query;
        // Centralized configuration for expiry (15 minutes default)
        const expiryMs = parseInt(process.env.DOCUMENT_URL_EXPIRY_MS, 10) || 900000;
        
        const result = await getService().getDownloadUrl(req.user, documentId, versionId, expiryMs);
        
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return handleDomainError(res, err);
    }
};

export const downloadContent = async (req, res) => {
    try {
        const { documentId } = req.params;
        const { versionId } = req.query;

        const result = await getService().readDocumentStream(req.user, documentId, versionId);
        
        res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
        if (result.sizeBytes) {
            res.setHeader('Content-Length', result.sizeBytes);
        }
        
        // Proper stream error handling for R4-E contract
        result.stream.on('error', (streamErr) => {
            console.error('[DocumentAPI] Stream error:', streamErr);
            if (!res.headersSent) {
                res.status(500).end();
            } else {
                res.end();
            }
        });

        // Abort cleanup
        req.on('aborted', () => {
            if (result.stream && typeof result.stream.destroy === 'function') {
                result.stream.destroy();
            }
        });

        // Pipe the provider stream directly to the client
        result.stream.pipe(res);

    } catch (err) {
        return handleDomainError(res, err);
    }
};

export const deleteDocument = async (req, res) => {
    try {
        const { documentId } = req.params;
        const result = await getService().deleteDocument(req.user, documentId);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return handleDomainError(res, err);
    }
};

export const listDocuments = async (req, res) => {
    try {
        const { entityType, entityId } = req.query;
        if (!entityType || !entityId) {
            return res.status(400).json({ success: false, error: "entityType and entityId are required" });
        }
        const result = await getService().listDocuments(req.user, entityType, entityId);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return handleDomainError(res, err);
    }
};

/**
 * Public/Token-authenticated route to stream document using a cryptographically signed token.
 * Validates expiration, provider binding, object key binding, and secret signature with constant-time equality.
 */
export const downloadSignedContent = async (req, res) => {
    try {
        const objectKey = req.params.objectKey || req.params[0];
        const token = req.query.token;

        if (!token) {
            return res.status(401).json({ success: false, error: 'Signed URL token is required.' });
        }
        if (!objectKey) {
            return res.status(400).json({ success: false, error: 'Object key is required.' });
        }

        const verification = GoogleDriveStorageAdapter.verifySignedToken(token, null, { objectKey });
        if (!verification.valid) {
            return res.status(403).json({
                success: false,
                error: `Signed URL access denied: ${verification.reason}`
            });
        }

        const service = getService();
        const adapter = await service.registry.resolve(verification.payload?.provider || 'google-drive-primary');
        const readResult = await adapter.read(objectKey);

        res.setHeader('Content-Type', readResult.mimeType || 'application/octet-stream');
        if (readResult.sizeBytes) {
            res.setHeader('Content-Length', readResult.sizeBytes);
        }
        const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
        res.setHeader('Content-Disposition', `${disposition}; filename="${readResult.originalFilename || path.basename(objectKey)}"`);

        readResult.stream.on('error', (streamErr) => {
            console.error('[DocumentAPI] Signed stream error:', streamErr);
            if (!res.headersSent) {
                res.status(500).end();
            } else {
                res.end();
            }
        });

        req.on('aborted', () => {
            if (readResult.stream && typeof readResult.stream.destroy === 'function') {
                readResult.stream.destroy();
            }
        });

        readResult.stream.pipe(res);
    } catch (err) {
        return handleDomainError(res, err);
    }
};
