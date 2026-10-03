import DocumentService from '../services/storage/DocumentService.js';
import { StorageError, ObjectNotFoundError, ObjectConflictError, ProviderUnavailableError, CapabilityNotSupportedError } from '../services/storage/StorageErrors.js';
import { AccessDeniedError, LifecycleRestrictionError } from '../services/storage/DocumentAccessService.js';
import mongoose from 'mongoose';

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

        const result = await getService().uploadFile(req.user, documentId, versionId, streamOrBuffer, mimeType, sizeBytes);
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
