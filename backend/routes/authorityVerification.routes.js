import express from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import { checkPermission, checkApprovalRight } from '../middlewares/permission.middleware.js';
import {
    getSourceSettings,
    getSourceSettingByCode,
    updateSourceSettings,
    getLinksForInventory,
    createOrUpdateLink,
    createVerificationRun,
    getVerificationRuns,
    getVerificationRunById,
    getPendingReviews,
    submitReview,
    applyApprovedChanges,
    getVerificationHistory
} from '../controllers/authorityVerification.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================
// SOURCE SETTINGS (Admin)
// ============================================================
// View settings — requires authorityVerification.view
router.get('/settings',
    checkPermission('authorityVerification', 'view'),
    getSourceSettings
);
router.get('/settings/:authorityCode',
    checkPermission('authorityVerification', 'view'),
    getSourceSettingByCode
);
// Update settings — requires admin approval right
router.patch('/settings/:authorityCode',
    checkPermission('authorityVerification', 'edit'),
    checkApprovalRight('manageAuthoritySettings'),
    updateSourceSettings
);

// ============================================================
// AUTHORITY LINKS
// ============================================================
router.get('/links/:inventoryId',
    checkPermission('authorityVerification', 'view'),
    getLinksForInventory
);
router.post('/links',
    checkPermission('authorityVerification', 'create'),
    createOrUpdateLink
);

// ============================================================
// VERIFICATION RUNS
// ============================================================
router.get('/runs',
    checkPermission('authorityVerification', 'view'),
    getVerificationRuns
);
router.get('/runs/:runId',
    checkPermission('authorityVerification', 'view'),
    getVerificationRunById
);
router.post('/runs',
    checkPermission('authorityVerification', 'create'),
    createVerificationRun
);

// ============================================================
// REVIEW & APPLY
// ============================================================
router.get('/review/pending',
    checkPermission('authorityVerification', 'edit'),
    getPendingReviews
);
router.post('/review/:itemId',
    checkPermission('authorityVerification', 'edit'),
    submitReview
);
router.post('/apply/:itemId',
    checkPermission('authorityVerification', 'edit'),
    checkApprovalRight('approveAuthorityChanges'),
    applyApprovedChanges
);

// ============================================================
// VERIFICATION HISTORY
// ============================================================
router.get('/history/:inventoryId',
    checkPermission('authorityVerification', 'view'),
    getVerificationHistory
);

export default router;
