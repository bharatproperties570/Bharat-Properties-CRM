import marketingDocumentContextService from '../services/marketing/MarketingDocumentContextService.js';

export const listApprovedMarketingDocuments = async (req, res) => {
    try {
        const documents = await marketingDocumentContextService.listApprovedPdfDocuments({
            user: req.user,
            entityType: req.query.entityType,
            entityId: req.query.entityId
        });
        return res.json({ success: true, documents });
    } catch (error) {
        const status = Number(error.statusCode) || 500;
        if (status >= 500) {
            console.error('[MarketingDocumentContext] Approved document listing failed:', error.code || 'INTERNAL_ERROR');
        }
        return res.status(status).json({
            success: false,
            error: error.code || 'APPROVED_DOCUMENT_LIST_FAILED'
        });
    }
};

export const getApprovedMarketingDocumentContext = async (req, res) => {
    try {
        const context = await marketingDocumentContextService.getApprovedPdfContext({
            user: req.user,
            documentId: req.params.documentId,
            versionId: req.body?.versionId
        });
        // The extracted text is returned only to the authenticated, ACL-authorized requester.
        // It is never persisted or included in server logs.
        return res.json({ success: true, context });
    } catch (error) {
        const status = Number(error.statusCode) || 500;
        if (status >= 500) {
            console.error('[MarketingDocumentContext] Approved context retrieval failed:', error.code || 'INTERNAL_ERROR');
        }
        return res.status(status).json({
            success: false,
            error: error.code || 'APPROVED_DOCUMENT_CONTEXT_FAILED'
        });
    }
};
