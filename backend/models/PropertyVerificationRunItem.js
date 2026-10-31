import mongoose from 'mongoose';
import { CANONICAL_TO_CRM_FIELD_MAP, CRM_TO_CANONICAL_FIELD_MAP } from '../services/authority/authorityFieldDictionary.js';

/**
 * PropertyVerificationRunItem
 * 
 * Individual item within a verification run.
 * Tracks per-property processing state, proposed field differences,
 * reviewer decisions, and application audit references.
 */

const ITEM_STATUSES = [
    'PENDING',         // Awaiting processing
    'PROCESSING',      // Currently being processed
    'SUCCEEDED',       // Authority data retrieved and normalized
    'FAILED',          // Processing error
    'SKIPPED',         // Skipped (e.g., ineligible identity)
    'NO_MATCH',        // Authority returned no matching record
    'UNRESOLVED',      // Could not determine unique match
    'AMBIGUOUS',       // Multiple potential matches found
    'NEEDS_REVIEW'     // Requires human review
];

const MATCH_STATUSES = [
    'NOT_ATTEMPTED',   // Not yet looked up
    'EXACT_MATCH',     // Single confirmed match
    'PARTIAL_MATCH',   // Some fields matched but identity uncertain
    'NO_MATCH',        // No matching record found
    'MULTIPLE_MATCHES',// Multiple candidates found
    'IDENTITY_MISMATCH'// Returned data contradicts expected identity
];

const REVIEWER_DECISIONS = [
    'PENDING',         // Not yet reviewed
    'APPROVED',        // Reviewer approved proposed changes
    'REJECTED',        // Reviewer rejected changes
    'PARTIAL',         // Reviewer approved some fields, rejected others
    'DEFERRED'         // Deferred for later review
];

const PropertyVerificationRunItemSchema = new mongoose.Schema({
    // ========== References ==========
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    runId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyVerificationRun',
        required: true,
        index: true
    },
    inventoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true,
        index: true
    },
    linkId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyAuthorityLink',
        required: false,
        default: null
    },
    authorityCode: {
        type: String,
        required: true,
        enum: ['HSVP', 'CHD', 'GMADA']
    },

    // ========== Processing State ==========
    status: {
        type: String,
        required: true,
        enum: ITEM_STATUSES,
        default: 'PENDING',
        index: true
    },
    processedAt: {
        type: Date,
        default: null
    },
    errorMessage: {
        type: String,
        default: null
    },

    // ========== Match Result ==========
    matchStatus: {
        type: String,
        enum: MATCH_STATUSES,
        default: 'NOT_ATTEMPTED'
    },
    snapshotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyVerificationSnapshot',
        default: null
    },

    // ========== Proposed Field Differences ==========
    // Explicit allowlist of before/after values for approved canonical fields only
    proposedChanges: [{
        field: {
            type: String,
            required: true
        },
        currentValue: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        proposedValue: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        changeType: {
            type: String,
            enum: ['NEW', 'UPDATE', 'CONFIRM', 'CONFLICT'],
            default: 'NEW'
        },
        // Whether this field was approved for application
        approved: {
            type: Boolean,
            default: null  // null = not yet reviewed
        }
    }],

    // ========== SAFETY: Fields that must NEVER appear in proposedChanges ==========
    // Enforced at controller level, not just schema level

    // ========== Review Decision ==========
    reviewerDecision: {
        type: String,
        enum: REVIEWER_DECISIONS,
        default: 'PENDING'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    reviewNotes: {
        type: String,
        default: null
    },

    // ========== Application Audit ==========
    isSynthetic: {
        type: Boolean,
        default: false,
        index: true
    },
    provenance: {
        type: String,
        enum: ['LIVE', 'SYNTHETIC_FIXTURE'],
        index: true
    },
    claimedBy: {
        type: String,
        default: null
    },
    claimedAt: {
        type: Date,
        default: null
    },
    leaseExpiresAt: {
        type: Date,
        default: null,
        index: true
    },
    appliedAt: {
        type: Date,
        default: null
    },
    appliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    applicationAuditId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AuditLog',
        default: null
    },
    // Prevent duplicate applications
    applied: {
        type: Boolean,
        default: false,
        index: true
    },
    // ========== Atomic Application State & Claim ==========
    applyState: {
        type: String,
        enum: ['UNAPPLIED', 'APPLYING', 'APPLIED', 'FAILED', 'COMPENSATION_FAILED'],
        default: 'UNAPPLIED',
        index: true
    },
    // ========== Crash Recovery & Orphan Management ==========
    recoveryState: {
        stage: {
            type: String,
            enum: ['NONE', 'ORPHAN_DETECTED', 'ORPHAN_PURGED_AUDIT_PENDING', 'ROLLBACK_PURGE_PENDING', 'ORPHAN_RECOVERED', 'CLEANUP_FAILED'],
            default: 'NONE'
        },
        orphanedSnapshotId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        orphanedByWorkerId: {
            type: String,
            default: null
        },
        recoveredByWorkerId: {
            type: String,
            default: null
        },
        recoveredAt: {
            type: Date,
            default: null
        },
        purgedAt: {
            type: Date,
            default: null
        },
        failedAt: {
            type: Date,
            default: null
        },
        error: {
            type: String,
            default: null
        },
        retryCount: {
            type: Number,
            default: 0
        }
    },
    applyClaim: {
        claimedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        claimId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        reconcilerClaimId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        fenceToken: {
            type: Number,
            default: 0
        },
        claimedAt: {
            type: Date,
            default: null
        },
        leaseExpiresAt: {
            type: Date,
            default: null,
            index: true
        },
        stage: {
            type: String,
            enum: ['IDLE', 'CLAIMED', 'INVENTORY_MUTATING', 'INVENTORY_MUTATED', 'AUDIT_LOGGING', 'AUDIT_LOGGED', 'FINALIZING', 'COMPLETED', 'FAILED', 'COMPENSATING', 'COMPENSATED', 'COMPENSATION_FAILED', 'RECONCILING'],
            default: 'IDLE'
        },
        expectedPreviousClaimId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        idempotencyKey: {
            type: String,
            default: null
        },
        compensation: {
            inventoryBefore: {
                type: mongoose.Schema.Types.Mixed,
                default: null
            },
            auditId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'AuditLog',
                default: null
            }
        }
    },
    applyError: {
        type: String,
        default: null
    }
}, {
    timestamps: true,
    collection: 'property_verification_run_items'
});

// ========== Indexes ==========
PropertyVerificationRunItemSchema.index({ runId: 1, status: 1 });
PropertyVerificationRunItemSchema.index({ tenantId: 1, runId: 1, status: 1 });
PropertyVerificationRunItemSchema.index({ tenantId: 1, inventoryId: 1, createdAt: -1 });
PropertyVerificationRunItemSchema.index({ tenantId: 1, reviewerDecision: 1 });
PropertyVerificationRunItemSchema.index({ tenantId: 1, applyState: 1 });
PropertyVerificationRunItemSchema.index({ tenantId: 1, 'applyClaim.claimId': 1 });
PropertyVerificationRunItemSchema.index({ tenantId: 1, 'applyClaim.leaseExpiresAt': 1 });
// Prevent duplicate items for the same inventory in the same run
PropertyVerificationRunItemSchema.index(
    { runId: 1, inventoryId: 1 },
    { unique: true }
);

// ========== Safety Constants ==========
/**
 * Fields that MUST NEVER be included in proposedChanges.
 * Enforced server-side in the controller.
 */
const BLOCKED_UPDATE_FIELDS = new Set([
    'status',          // Inventory.status is CRM business status — NEVER overwrite
    '_id',
    'tenantId',
    'createdAt',
    'updatedAt',
    'owners',          // No automatic Contact creation/linking
    'associates',
    'teams',
    'team',
    'assignedTo',
    'department',
    'visibleTo',
    // Phase 2.7 Privacy Storage Boundary: Personal information is strictly blocked
    'ownerName',
    'allotteeName',
    'allotteeAddress',
    'ownerPhone',
    'ownerEmail',
    'allotteePhone',
    'allotteeEmail',
    'phone',
    'email',
    'authorityVerification.ownerName',
    'authorityVerification.allotteeName',
    'authorityVerification.allotteeAddress'
]);

/**
 * Fields that may appear in proposedChanges — explicit allowlist.
 * Only canonical authority fields that map to Inventory.
 */
const ALLOWED_UPDATE_FIELDS = new Set([
    // Authority verification summary (stored in a sub-document, not top-level Inventory fields)
    'authorityVerification.propertyId',
    'authorityVerification.fileNumber',
    'authorityVerification.formNumber',
    'authorityVerification.sectorNumber',
    'authorityVerification.phaseCode',
    'authorityVerification.blockCode',
    'authorityVerification.schemeName',
    'authorityVerification.urbanEstate',
    'authorityVerification.estateOffice',
    'authorityVerification.propertyCategory',
    'authorityVerification.propertyType',
    'authorityVerification.propertySize',
    'authorityVerification.propertyAreaValue',
    'authorityVerification.propertyAreaUnit',
    'authorityVerification.allotmentDate',
    'authorityVerification.transferDate',
    'authorityVerification.possessionDate',
    'authorityVerification.allotmentMode',
    'authorityVerification.possessionStatus',
    'authorityVerification.buildingPlanApproved',
    'authorityVerification.occupancyCertificate',
    'authorityVerification.litigationStatus',
    'authorityVerification.mortgageStatus',
    'authorityVerification.authorityStatus',
    'authorityVerification.duesStatus',
    'authorityVerification.leaseRentStatus'
]);

/**
 * Validate that no proposed change targets a blocked field.
 */
PropertyVerificationRunItemSchema.methods.validateProposedChanges = function () {
    const violations = [];
    if (!this.proposedChanges || this.proposedChanges.length === 0) return violations;

    for (const change of this.proposedChanges) {
        if (BLOCKED_UPDATE_FIELDS.has(change.field)) {
            violations.push(`Blocked field: ${change.field}`);
        }
        if (!ALLOWED_UPDATE_FIELDS.has(change.field)) {
            violations.push(`Field not in allowlist: ${change.field}`);
        }
    }
    return violations;
};

// ========== Statics ==========
PropertyVerificationRunItemSchema.statics.getForRun = function (tenantId, runId, options = {}) {
    const query = this.find({ tenantId, runId });
    if (options.status) query.where('status', options.status);
    if (options.reviewerDecision) query.where('reviewerDecision', options.reviewerDecision);
    return query
        .populate('inventoryId', 'unitNo unitNumber projectName sector')
        .populate('snapshotId')
        .sort({ createdAt: 1 })
        .limit(options.limit || 100);
};

PropertyVerificationRunItemSchema.statics.getPendingReview = function (tenantId) {
    return this.find({
        tenantId,
        status: 'SUCCEEDED',
        reviewerDecision: 'PENDING',
        applied: false
    })
        .populate('inventoryId', 'unitNo unitNumber projectName sector')
        .populate('snapshotId')
        .sort({ createdAt: -1 });
};

export {
    ITEM_STATUSES,
    MATCH_STATUSES,
    REVIEWER_DECISIONS,
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS,
    CANONICAL_TO_CRM_FIELD_MAP,
    CRM_TO_CANONICAL_FIELD_MAP
};
export default mongoose.model('PropertyVerificationRunItem', PropertyVerificationRunItemSchema);
