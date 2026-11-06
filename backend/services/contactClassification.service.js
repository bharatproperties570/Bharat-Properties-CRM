import crypto from 'crypto';

/**
 * Enterprise Contact Deduplication & Reconciliation Classifier
 * Phase 4.7 Contract
 *
 * Implements deterministic group-level classification with strict fail-closed safety.
 * No automated merge is ever permitted by name similarity alone.
 */

export const CLASSIFICATION_TYPES = Object.freeze({
    SAFE_AUTO_MERGE: 'SAFE_AUTO_MERGE',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    DO_NOT_MERGE: 'DO_NOT_MERGE'
});

export const REASON_CODES = Object.freeze({
    NAME_EXACT_MATCH: 'NAME_EXACT_MATCH',
    NAME_STRONG_MATCH: 'NAME_STRONG_MATCH',
    NAME_CONFLICT: 'NAME_CONFLICT',
    NAME_MISSING: 'NAME_MISSING',
    OWNER_MISMATCH: 'OWNER_MISMATCH',
    DOCUMENTS_CONFLICT: 'DOCUMENTS_CONFLICT',
    OPERATIONAL_REFERENCES_PRESENT: 'OPERATIONAL_REFERENCES_PRESENT',
    PRIMARY_PHONE_COLLISION: 'PRIMARY_PHONE_COLLISION',
    SECONDARY_PHONE_COLLISION: 'SECONDARY_PHONE_COLLISION',
    MIXED_PHONE_POSITION: 'MIXED_PHONE_POSITION',
    MULTI_CONTACT_GROUP: 'MULTI_CONTACT_GROUP',
    INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
    LIFECYCLE_FLAG_GAP: 'LIFECYCLE_FLAG_GAP'
});

export const CONFIDENCE_LEVELS = Object.freeze({
    HIGH: 'HIGH',
    MEDIUM: 'MEDIUM',
    LOW: 'LOW'
});

/**
 * Mask a phone number to protect PII in logs, UI and audit records.
 * Example: "9811223344" -> "+91 ***** *3344"
 */
export function maskPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return '***';
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.length < 4) return '***';
    const last4 = digits.slice(-4);
    return `+91 ***** *${last4}`;
}

/**
 * Mask a contact identifier or name for privacy.
 * Example: "Ramesh Sharma" -> "R***** S*****"
 */
export function maskName(name) {
    if (!name || typeof name !== 'string') return 'Unknown';
    const parts = name.trim().split(/\s+/);
    return parts.map(p => p.length > 1 ? `${p[0]}*****` : p).join(' ');
}

/**
 * Calculate deterministic name similarity between two string values.
 * Returns: 'exact' | 'strong' | 'conflict' | 'missing'
 */
export function calculateNameSimilarity(name1, name2) {
    if (!name1 || !name2) return 'missing';
    const clean1 = name1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = name2.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean1 || !clean2) return 'missing';
    if (clean1 === clean2) return 'exact';
    if (clean1.includes(clean2) || clean2.includes(clean1)) return 'strong';
    return 'conflict';
}

/**
 * Compute immutable SHA-256 fingerprint for a duplicate group.
 */
export function computeGroupFingerprint(phoneNumber, contactIds) {
    const sortedIds = [...contactIds].map(id => id.toString()).sort();
    const payload = `${phoneNumber}:${sortedIds.join(',')}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Calculate profile completeness score (0-100) based on populated standard fields.
 */
export function calculateProfileCompleteness(contact) {
    const fields = [
        'name', 'surname', 'emails', 'company', 'designation',
        'personalAddress', 'source', 'department', 'tags', 'description'
    ];
    let score = 0;
    const populated = [];

    for (const f of fields) {
        const val = contact[f];
        if (val !== undefined && val !== null) {
            if (Array.isArray(val) && val.length > 0) {
                score += 10;
                populated.push(f);
            } else if (typeof val === 'object' && Object.keys(val).length > 0) {
                score += 10;
                populated.push(f);
            } else if (typeof val === 'string' && val.trim().length > 0) {
                score += 10;
                populated.push(f);
            }
        }
    }
    return { score, populated };
}

/**
 * Evaluates a duplicate contact group and produces a deterministic reconciliation contract.
 *
 * @param {Object} params
 * @param {string} params.phoneNumber - The duplicated phone number string
 * @param {Array<Object>} params.contacts - Full contact documents in this group
 * @param {Object} [params.referenceMap] - Map of contactId -> reference counts
 * @returns {Object} Reconciliation Classification Contract
 */
export function classifyReconciliationGroup({ phoneNumber, contacts, referenceMap = {} }) {
    if (!contacts || !Array.isArray(contacts) || contacts.length < 2) {
        throw new Error('classifyReconciliationGroup requires at least 2 contacts');
    }

    const contactIds = contacts.map(c => c._id.toString());
    const fingerprint = computeGroupFingerprint(phoneNumber, contactIds);
    const phoneMasked = maskPhoneNumber(phoneNumber);

    const reasonCodes = [];
    let hasNameConflict = false;
    let hasNameMissing = false;
    let hasOwnerConflict = false;
    let hasDocConflict = false;
    let hasLifecycleGap = false;

    // Check lifecycle flag gaps
    for (const c of contacts) {
        if (c.isDeleted === undefined || c.isDeleted === null ||
            c.isMerged === undefined || c.isMerged === null) {
            hasLifecycleGap = true;
            reasonCodes.push(REASON_CODES.LIFECYCLE_FLAG_GAP);
            break;
        }
    }

    // Pairwise name and ownership comparison
    let exactMatches = 0;
    let strongMatches = 0;

    for (let i = 0; i < contacts.length; i++) {
        for (let j = i + 1; j < contacts.length; j++) {
            const sim = calculateNameSimilarity(contacts[i].name, contacts[j].name);
            if (sim === 'exact') exactMatches++;
            else if (sim === 'strong') strongMatches++;
            else if (sim === 'missing') hasNameMissing = true;
            else if (sim === 'conflict') hasNameConflict = true;

            // Check owner conflict
            const ownerA = contacts[i].owner?.toString();
            const ownerB = contacts[j].owner?.toString();
            if (ownerA && ownerB && ownerA !== ownerB) {
                hasOwnerConflict = true;
            }

            // Check document conflict
            const docsA = contacts[i].documents?.length || 0;
            const docsB = contacts[j].documents?.length || 0;
            if (docsA > 0 && docsB > 0) {
                hasDocConflict = true;
            }
        }
    }

    if (hasNameConflict) reasonCodes.push(REASON_CODES.NAME_CONFLICT);
    if (hasNameMissing) reasonCodes.push(REASON_CODES.NAME_MISSING);
    if (!hasNameConflict && exactMatches > 0 && strongMatches === 0 && !hasNameMissing) {
        reasonCodes.push(REASON_CODES.NAME_EXACT_MATCH);
    } else if (!hasNameConflict && (strongMatches > 0 || exactMatches > 0)) {
        reasonCodes.push(REASON_CODES.NAME_STRONG_MATCH);
    }

    if (hasOwnerConflict) reasonCodes.push(REASON_CODES.OWNER_MISMATCH);
    if (hasDocConflict) reasonCodes.push(REASON_CODES.DOCUMENTS_CONFLICT);
    if (contacts.length > 2) reasonCodes.push(REASON_CODES.MULTI_CONTACT_GROUP);

    // Phone position evaluation
    let primaryCount = 0;
    let secondaryCount = 0;
    const phonePositions = [];

    for (const c of contacts) {
        const pList = c.phones || [];
        const idx = pList.findIndex(p => p.number === phoneNumber);
        if (idx === 0) {
            primaryCount++;
            phonePositions.push({ contactId: c._id, position: 'PRIMARY' });
        } else if (idx > 0) {
            secondaryCount++;
            phonePositions.push({ contactId: c._id, position: 'SECONDARY' });
        } else {
            phonePositions.push({ contactId: c._id, position: 'UNKNOWN' });
        }
    }

    let phonePositionType;
    if (primaryCount === contacts.length) {
        phonePositionType = 'PRIMARY_PRIMARY';
        reasonCodes.push(REASON_CODES.PRIMARY_PHONE_COLLISION);
    } else if (secondaryCount === contacts.length) {
        phonePositionType = 'SECONDARY_SECONDARY';
        reasonCodes.push(REASON_CODES.SECONDARY_PHONE_COLLISION);
    } else {
        phonePositionType = 'PRIMARY_SECONDARY';
        reasonCodes.push(REASON_CODES.MIXED_PHONE_POSITION);
    }

    // Operational reference calculation
    let totalReferences = 0;
    const contactRefWeights = [];

    for (const c of contacts) {
        const cId = c._id.toString();
        const refs = referenceMap[cId] || {
            leads: 0, deals: 0, bookings: 0, inventory: 0,
            activities: 0, conversations: 0, companies: 0,
            documents: 0, callIntelligence: 0
        };
        const sum = (refs.leads || 0) * 10 +
                    (refs.deals || 0) * 20 +
                    (refs.bookings || 0) * 25 +
                    (refs.inventory || 0) * 15 +
                    (refs.activities || 0) * 5 +
                    (refs.conversations || 0) * 5 +
                    (refs.companies || 0) * 5 +
                    (refs.documents || 0) * 10 +
                    (refs.callIntelligence || 0) * 5;

        totalReferences += sum;
        const completeness = calculateProfileCompleteness(c);
        contactRefWeights.push({
            contactId: c._id,
            contactDoc: c,
            operationalWeight: sum,
            referenceCounts: refs,
            completenessScore: completeness.score,
            createdAt: new Date(c.createdAt || 0).getTime(),
            isPrimaryPhone: (c.phones || [])[0]?.number === phoneNumber
        });
    }

    if (totalReferences > 0) {
        reasonCodes.push(REASON_CODES.OPERATIONAL_REFERENCES_PRESENT);
    }

    // Deterministic Canonical Master Selection
    // Hierarchy:
    // 1. Highest Operational Weight (protects references)
    // 2. Profile Completeness Score
    // 3. Earliest Creation Date (createdAt timestamp)
    // 4. Primary phone holder over secondary
    contactRefWeights.sort((a, b) => {
        if (b.operationalWeight !== a.operationalWeight) {
            return b.operationalWeight - a.operationalWeight;
        }
        if (b.completenessScore !== a.completenessScore) {
            return b.completenessScore - a.completenessScore;
        }
        if (a.createdAt !== b.createdAt) {
            return a.createdAt - b.createdAt; // Earliest first
        }
        if (a.isPrimaryPhone !== b.isPrimaryPhone) {
            return b.isPrimaryPhone ? 1 : -1;
        }
        return a.contactId.toString().localeCompare(b.contactId.toString());
    });

    const canonicalMasterId = contactRefWeights[0].contactId;
    const duplicateIds = contactRefWeights.slice(1).map(w => w.contactId);

    // Primary Classification Assignment
    let primaryClassification;
    let confidence;

    if (hasNameConflict) {
        // Strict Rule: Different human beings sharing a phone number
        primaryClassification = CLASSIFICATION_TYPES.DO_NOT_MERGE;
        confidence = CONFIDENCE_LEVELS.HIGH;
    } else if (hasOwnerConflict || hasDocConflict || hasNameMissing || hasLifecycleGap || contacts.length > 2) {
        // Compatible names but requires operator review
        primaryClassification = CLASSIFICATION_TYPES.REVIEW_REQUIRED;
        confidence = CONFIDENCE_LEVELS.MEDIUM;
    } else if (!hasNameConflict && (exactMatches > 0 || strongMatches > 0)) {
        // Safe deterministic merge
        primaryClassification = CLASSIFICATION_TYPES.SAFE_AUTO_MERGE;
        confidence = CONFIDENCE_LEVELS.HIGH;
    } else {
        // Fail-closed fallback
        primaryClassification = CLASSIFICATION_TYPES.REVIEW_REQUIRED;
        confidence = CONFIDENCE_LEVELS.LOW;
        reasonCodes.push(REASON_CODES.INSUFFICIENT_EVIDENCE);
    }

    // Phone Disassociation Proposal (for DO_NOT_MERGE)
    let phoneDisassociationPlan = null;
    if (primaryClassification === CLASSIFICATION_TYPES.DO_NOT_MERGE) {
        if (phonePositionType === 'PRIMARY_SECONDARY') {
            // Find contact holding phone as secondary
            const secondaryHolder = contactRefWeights.find(w => !w.isPrimaryPhone);
            const primaryHolder = contactRefWeights.find(w => w.isPrimaryPhone);
            if (secondaryHolder && primaryHolder) {
                phoneDisassociationPlan = {
                    action: 'REMOVE_SECONDARY_PHONE',
                    targetContactId: secondaryHolder.contactId,
                    targetContactMaskedName: maskName(secondaryHolder.contactDoc.name),
                    primaryContactId: primaryHolder.contactId,
                    primaryContactMaskedName: maskName(primaryHolder.contactDoc.name),
                    phoneMasked,
                    explanation: 'Remove duplicate alternate phone from Contact B, retaining primary ownership on Contact A'
                };
            }
        } else {
            phoneDisassociationPlan = {
                action: 'OPERATOR_OWNERSHIP_VERIFICATION',
                targetContactId: null,
                phoneMasked,
                explanation: 'Both contacts hold this number as Primary phone. Operator confirmation required before updating.'
            };
        }
    }

    return {
        fingerprint,
        phoneNumber,
        phoneMasked,
        primaryClassification,
        confidence,
        reasonCodes: [...new Set(reasonCodes)],
        evidence: {
            nameSimilarity: hasNameConflict ? 'conflict' : (hasNameMissing ? 'missing' : (exactMatches > 0 ? 'exact' : 'strong')),
            hasOwnerConflict,
            hasDocumentConflict: hasDocConflict,
            hasLifecycleGap,
            phonePosition: phonePositionType,
            contactCount: contacts.length,
            totalReferences,
            contactEvaluations: contactRefWeights.map(w => ({
                contactId: w.contactId,
                maskedName: maskName(w.contactDoc.name),
                operationalWeight: w.operationalWeight,
                completenessScore: w.completenessScore,
                isPrimaryPhone: w.isPrimaryPhone,
                createdAt: new Date(w.createdAt).toISOString()
            }))
        },
        suggestedCanonicalMasterId: canonicalMasterId,
        suggestedDuplicateIds: duplicateIds,
        phoneDisassociationPlan
    };
}
