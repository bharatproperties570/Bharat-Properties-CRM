import { useState, useCallback, useEffect } from 'react';
import { api, BASE_BACKEND_URL } from '../utils/api';
import toast from 'react-hot-toast';
import { LegacyDocumentMapper, DocumentMapper } from '../utils/mappers/DocumentMappers';

/**
 * useDocumentManager
 * 
 * Coordinates the R4-G Hybrid Architecture:
 * 1. Fetches and normalizes new Documents via Document API.
 * 2. Merges them with externally provided legacy documents.
 * 3. Handles new uploads using the two-step Document API process.
 * 4. Handles secure blob content reads for new Documents.
 * 5. Handles logical deletion of new Documents.
 */
export const useDocumentManager = (entityType, entityId, legacyDocuments = []) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Feature Flag: Enable R4-E new document upload flow.
    // If false, components fall back to legacy Google Drive flow.
    const FEATURE_FLAG_NEW_DOCUMENTS = true;

    const fetchNewDocuments = useCallback(async () => {
        if (!entityType || !entityId) return [];
        try {
            const res = await api.get(`/documents?entityType=${entityType}&entityId=${entityId}`);
            if (res.data && res.data.success) {
                return res.data.data;
            }
            return [];
        } catch (err) {
            console.error("Failed to fetch new documents:", err);
            return [];
        }
    }, [entityType, entityId]);

    const refreshDocuments = useCallback(async () => {
        if (!entityType || !entityId) return;
        setLoading(true);
        setError(null);
        try {
            // 1. Map Legacy
            const mappedLegacy = (legacyDocuments || []).map(item => LegacyDocumentMapper(item, entityType, entityId));

            // 2. Fetch & Map New
            let mappedNew = [];
            if (FEATURE_FLAG_NEW_DOCUMENTS) {
                const newDocs = await fetchNewDocuments();
                mappedNew = newDocs.map(item => DocumentMapper(item)).filter(Boolean);
            }

            // 3. Merge & Sort (newest first, fallback to string compare)
            const combined = [...mappedLegacy, ...mappedNew].sort((a, b) => {
                const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
                const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
                return dateB - dateA;
            });

            setDocuments(combined);
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to load documents");
        } finally {
            setLoading(false);
        }
    }, [entityType, entityId, legacyDocuments, fetchNewDocuments]);

    // Re-run refresh whenever legacy arrays change (from parent entity updates)
    useEffect(() => {
        refreshDocuments();
    }, [refreshDocuments]);

    const handleBackendError = (err) => {
        const status = err.response?.status;
        switch (status) {
            case 403: toast.error("You do not have permission to access this document."); break;
            case 404: toast.error("Document not found."); break;
            case 409: toast.error("Document cannot be changed in its current state."); break;
            case 413: toast.error("File is too large."); break;
            case 501: toast.error("Document operation is not currently supported."); break;
            case 503: toast.error("Document service is temporarily unavailable."); break;
            default: toast.error(err.response?.data?.message || "An unexpected error occurred.");
        }
    };

    /**
     * Uploads a NEW document via R4-E APIs.
     */
    const uploadNewDocument = async (file, metadata) => {
        if (!FEATURE_FLAG_NEW_DOCUMENTS) {
            toast.error("New document architecture is currently disabled.");
            return false;
        }

        try {
            // Step 1: Create logical document
            const createRes = await api.post('/documents', {
                entityType,
                entityId,
                metadata
            });

            const documentId = createRes.data?.data?.document?.documentId;
            if (!documentId) throw new Error("Failed to generate document ID");

            // Step 2: Upload physical bytes
            const formData = new FormData();
            formData.append('file', file);
            
            await api.post(`/documents/${documentId}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            toast.success("Document uploaded successfully. Malware scan pending.");
            await refreshDocuments();
            return true;
        } catch (err) {
            handleBackendError(err);
            return false;
        }
    };

    /**
     * Delete a NEW document via R4-E APIs.
     */
    const deleteNewDocument = async (documentId) => {
        try {
            await api.delete(`/documents/${documentId}`);
            toast.success("Document logically deleted.");
            await refreshDocuments();
            return true;
        } catch (err) {
            handleBackendError(err);
            return false;
        }
    };

    /**
     * Securely reads a NEW document content using blob response.
     */
    const readNewDocument = async (documentId, fileName) => {
        const toastId = toast.loading("Downloading document securely...");
        try {
            const res = await api.get(`/documents/${documentId}/content`, {
                responseType: 'blob'
            });
            
            // Create object URL and trigger download
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName || `document-\${documentId}`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            toast.success("Download complete", { id: toastId });
        } catch (err) {
            toast.dismiss(toastId);
            handleBackendError(err);
        }
    };

    return {
        documents,
        loading,
        error,
        refreshDocuments,
        uploadNewDocument,
        deleteNewDocument,
        readNewDocument,
        FEATURE_FLAG_NEW_DOCUMENTS
    };
};
