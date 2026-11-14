import marketingDocumentApprovalService from '../services/marketing/MarketingDocumentApprovalService.js';

const respondWithError = (res, error) => {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    const known = status >= 400 && status < 500;
    return res.status(status).json({
        success: false,
        code: known ? error.code : 'MARKETING_DOCUMENT_APPROVAL_FAILED',
        message: known ? error.code : 'Marketing document approval could not be completed'
    });
};

export const approveMarketingDocument = async (req, res) => {
    try {
        const data = await marketingDocumentApprovalService.approve({
            user: req.user,
            documentId: req.params.documentId
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return respondWithError(res, error);
    }
};

export const revokeMarketingDocumentApproval = async (req, res) => {
    try {
        const data = await marketingDocumentApprovalService.revoke({
            user: req.user,
            documentId: req.params.documentId
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return respondWithError(res, error);
    }
};
