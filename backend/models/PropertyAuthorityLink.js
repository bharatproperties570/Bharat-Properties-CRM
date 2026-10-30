import mongoose from 'mongoose';

/**
 * PropertyAuthorityLink
 * 
 * Maps an Inventory record to its authority-specific identifiers.
 * Keeps authority identity fields separate from core CRM property fields.
 * 
 * One link per (tenantId, inventoryId, authorityCode) combination.
 * The composite key is derived from the Phase 1 contract but is NOT proof
 * of a verified identity — it is a candidate match only.
 */

const MATCH_ELIGIBILITY = [
    'ELIGIBLE',        // All required identity fields present and valid
    'INCOMPLETE',      // Missing required identity fields
    'AMBIGUOUS',       // Identity could match multiple records
    'NEEDS_REVIEW',    // Identity components need human verification
    'INELIGIBLE'       // Cannot be matched (e.g., wrong authority area)
];

const PropertyAuthorityLinkSchema = new mongoose.Schema({
    // ========== Core References ==========
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    inventoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true,
        index: true
    },
    authorityCode: {
        type: String,
        required: true,
        enum: ['HSVP', 'CHD', 'GMADA'],
        index: true
    },

    // ========== Authority Identity Fields ==========
    // Each kept separate per Phase 1 contract requirements
    schemeName: {
        type: String,
        default: null,
        trim: true
    },
    urbanEstate: {
        type: String,
        default: null,
        trim: true
    },
    sectorNumber: {
        type: String,
        default: null,
        trim: true
    },
    phaseCode: {
        type: String,
        default: null,
        trim: true
    },
    blockCode: {
        type: String,
        default: null,
        trim: true
    },
    propertyId: {
        type: String,
        default: null,
        trim: true
    },
    fileNumber: {
        type: String,
        default: null,
        trim: true
    },
    formNumber: {
        type: String,
        default: null,
        trim: true
    },

    // ========== Composite Key & Match Status ==========
    compositeKey: {
        type: String,
        default: null,
        index: true
    },
    matchEligibility: {
        type: String,
        enum: MATCH_ELIGIBILITY,
        default: 'INCOMPLETE'
    },
    matchNotes: {
        type: String,
        default: null
    },

    // ========== Identity Evidence ==========
    identitySource: {
        type: String,
        enum: ['MANUAL_ENTRY', 'BULK_IMPORT', 'PREVIOUS_VERIFICATION', 'SYSTEM_INFERRED'],
        default: 'MANUAL_ENTRY'
    },
    mappingVersion: {
        type: String,
        default: '1.2.0'  // Phase 1.2 contract version
    },
    identityVerified: {
        type: Boolean,
        default: false  // True only after a successful authority lookup confirms the identity
    },
    identityVerifiedAt: {
        type: Date,
        default: null
    },

    // ========== Latest Snapshot Reference ==========
    latestSnapshotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyVerificationSnapshot',
        default: null
    },
    latestSnapshotAt: {
        type: Date,
        default: null
    },

    // ========== Operational ==========
    isActive: {
        type: Boolean,
        default: true
    },
    deactivatedReason: {
        type: String,
        default: null
    },
    duplicateOfLinkId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyAuthorityLink',
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true,
    collection: 'property_authority_links'
});

// ========== Indexes ==========
// Unique constraint: one link per inventory per authority per tenant
PropertyAuthorityLinkSchema.index(
    { tenantId: 1, inventoryId: 1, authorityCode: 1 },
    { unique: true }
);
// Composite key lookups
PropertyAuthorityLinkSchema.index({ tenantId: 1, compositeKey: 1 });
// Authority-specific queries
PropertyAuthorityLinkSchema.index({ tenantId: 1, authorityCode: 1, matchEligibility: 1 });
// Inventory detail page: all links for an inventory
PropertyAuthorityLinkSchema.index({ inventoryId: 1, isActive: 1 });

// ========== Methods ==========
/**
 * Check whether all required identity fields are present for the authority.
 * Uses the source policy's identity requirements.
 */
PropertyAuthorityLinkSchema.methods.evaluateEligibility = function (identityRequirements) {
    if (!identityRequirements || !identityRequirements.required) {
        return 'NEEDS_REVIEW';
    }

    const missing = identityRequirements.required.filter(field => {
        const val = this[field];
        return val === null || val === undefined || val === '';
    });

    if (missing.length > 0) {
        return 'INCOMPLETE';
    }

    // Even with all fields present, if identity is not verified, it's a candidate only
    if (!this.identityVerified) {
        return 'ELIGIBLE';  // Eligible for lookup, not confirmed
    }

    return 'ELIGIBLE';
};

// ========== Statics ==========
PropertyAuthorityLinkSchema.statics.getForInventory = function (tenantId, inventoryId) {
    return this.find({ tenantId, inventoryId, isActive: true })
        .populate('latestSnapshotId')
        .sort({ authorityCode: 1 });
};

PropertyAuthorityLinkSchema.statics.getByCompositeKey = function (tenantId, compositeKey) {
    return this.find({ tenantId, compositeKey, isActive: true });
};

/**
 * Reconciles duplicate authority links for a tenant (R-05).
 * 
 * Detects duplicate (inventoryId, authorityCode) sets within the tenant.
 * Deterministically selects the canonical link:
 * 1. Verified identity (identityVerified: true)
 * 2. Has latestSnapshotId attached
 * 3. Active status (isActive: true)
 * 4. Most recently updated
 * 
 * Reassigns any dangling references in PropertyVerificationRunItem and PropertyVerificationSnapshot
 * to the canonical link ID so historical records remain fully intact.
 * Deactivates or marks non-canonical duplicates without detaching or deleting valid inventory relationships.
 */
PropertyAuthorityLinkSchema.statics.reconcileDuplicateLinks = async function (tenantId, options = {}) {
    if (!tenantId) {
        throw new Error('TENANT_ID_REQUIRED: Tenant ID is required for duplicate link reconciliation');
    }

    const tId = tenantId instanceof mongoose.Types.ObjectId ? tenantId : new mongoose.Types.ObjectId(tenantId);
    const PropertyVerificationRunItem = mongoose.model('PropertyVerificationRunItem');

    // 1. Detect duplicates grouped by (inventoryId, authorityCode)
    const duplicateGroups = await this.aggregate([
        { $match: { tenantId: tId } },
        {
            $group: {
                _id: { inventoryId: '$inventoryId', authorityCode: '$authorityCode' },
                count: { $sum: 1 },
                linkIds: { $push: '$_id' }
            }
        },
        { $match: { count: { $gt: 1 } } }
    ]);

    let duplicateSetsCount = duplicateGroups.length;
    let canonicalLinksCount = 0;
    let reconciledDuplicatesCount = 0;
    let updatedReferencesCount = 0;

    for (const group of duplicateGroups) {
        const links = await this.find({
            _id: { $in: group.linkIds },
            tenantId: tId
        }).sort({
            identityVerified: -1,
            latestSnapshotId: -1,
            isActive: -1,
            updatedAt: -1,
            _id: -1
        });

        if (links.length <= 1) continue;

        // Deterministic winner
        const canonical = links[0];
        const duplicates = links.slice(1);
        canonicalLinksCount++;

        // Ensure canonical link is active and retains valid inventory relationship
        await this.updateOne(
            { _id: canonical._id, tenantId: tId },
            { $set: { isActive: true } }
        );

        const duplicateIds = duplicates.map(d => d._id);

        // 2. Safely reassign dangling references in RunItem to the canonical link
        // (Snapshots are strictly immutable audit records; they resolve via duplicateOfLinkId)
        const itemUpdateRes = await PropertyVerificationRunItem.updateMany(
            { tenantId: tId, linkId: { $in: duplicateIds } },
            { $set: { linkId: canonical._id } }
        );
        updatedReferencesCount += (itemUpdateRes.modifiedCount || 0);

        // 3. Mark non-canonical duplicates as inactive duplicates without deleting valid inventory references
        const dupUpdateRes = await this.updateMany(
            { _id: { $in: duplicateIds }, tenantId: tId },
            {
                $set: {
                    isActive: false,
                    matchEligibility: 'INELIGIBLE',
                    duplicateOfLinkId: canonical._id,
                    deactivatedReason: 'DUPLICATE_RECONCILED'
                }
            }
        );
        reconciledDuplicatesCount += (dupUpdateRes.modifiedCount || duplicates.length);
    }

    return {
        tenantId: tId.toString(),
        duplicateSetsCount,
        canonicalLinksCount,
        reconciledDuplicatesCount,
        updatedReferencesCount
    };
};

export { MATCH_ELIGIBILITY };
export default mongoose.model('PropertyAuthorityLink', PropertyAuthorityLinkSchema);
