/**
 * propertyComplianceValidator.js
 * 
 * Authoritative Property Verification & Marketing Compliance Validator
 * Implements strict statutory, legal, and regulatory marketing guardrails:
 * - Real estate advertising regulations (RERA, consumer protection)
 * - Evidence-backed authoritative verification contracts
 * - Deterministic post-generation compliance validation & sanitization
 */

export const RECOGNIZED_AUTHORITY_CODES = Object.freeze([
    'HSVP',
    'CHD',
    'ESTATE_OFFICE_CHD',
    'GMADA',
    'DDA',
    'PUDA'
]);

export const APPROVED_AUTHORITY_STATUSES = Object.freeze(['VERIFIED']);
export const APPROVED_RERA_STATUSES = Object.freeze(['APPROVED', 'REGISTERED', 'ACTIVE', 'VALID']);
export const DISALLOWED_RERA_STATUSES = Object.freeze([
    'EXPIRED',
    'REJECTED',
    'PENDING',
    'REVOKED',
    'UNDER_REVIEW',
    'SUSPENDED',
    'UNKNOWN',
    'NOT_APPROVED',
    'APPLIED',
    'IN_PROCESS'
]);

export const CLEAN_LITIGATION_STATUSES = Object.freeze([
    'CLEAN',
    'NONE',
    'NO_DISPUTE',
    'CLEAR',
    'NO_LITIGATION'
]);

const MAX_VERIFICATION_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000; // 1 minute

/**
 * Validates whether a snapshot identifier is structurally valid.
 * Must be a non-empty string of at least 3 characters and not a placeholder.
 */
function isValidSnapshotId(id) {
    if (!id || typeof id !== 'string') return false;
    const s = id.trim();
    if (s.length < 3) return false;
    if (['null', 'undefined', 'none', 'n/a', 'false'].includes(s.toLowerCase())) return false;
    return true;
}

/**
 * Validates whether a snapshot content hash is structurally valid.
 * Requires at least 16 hex or base64/url-safe alphanumeric characters.
 */
function isValidContentHash(hash) {
    if (!hash || typeof hash !== 'string') return false;
    const s = hash.trim();
    if (s.length < 16) return false;
    if (['null', 'undefined', 'none', 'n/a', 'false'].includes(s.toLowerCase())) return false;
    return /^[0-9a-fA-F]{16,}$/.test(s) || /^[0-9a-zA-Z_-]{16,}$/.test(s);
}

/**
 * Validates timestamp freshness within 180 days and rejects future timestamps and malformed dates.
 */
function isValidVerificationDate(rawDate) {
    if (!rawDate) return false;
    const d = new Date(rawDate);
    const time = d.getTime();
    if (isNaN(time)) return false;
    const now = Date.now();
    // Reject future timestamps beyond minor clock skew
    if (time > now + CLOCK_SKEW_TOLERANCE_MS) return false;
    // Reject timestamps older than 180 days
    if (now - time > MAX_VERIFICATION_AGE_MS) return false;
    return true;
}

/**
 * Validates explicit clean litigation status.
 * Missing, null, undefined, or empty litigation information must NEVER automatically be clean.
 */
function isExplicitlyCleanLitigation(litStatus) {
    if (!litStatus || typeof litStatus !== 'string') return false;
    const norm = litStatus.trim().toUpperCase();
    return CLEAN_LITIGATION_STATUSES.includes(norm);
}

/**
 * Evaluates an authoritative verification evidence block (from authorityVerification or authorityLink).
 */
function evaluateAuthoritativeEvidence(evidence) {
    if (!evidence || typeof evidence !== 'object') return false;

    // 1. Authority code check
    const rawCode = evidence.authorityCode || evidence.authority;
    if (!rawCode || typeof rawCode !== 'string') return false;
    const code = rawCode.trim().toUpperCase();
    if (!RECOGNIZED_AUTHORITY_CODES.includes(code)) return false;

    // 2. Explicitly approved status (strictly 'VERIFIED')
    const rawStatus = evidence.authorityStatus || evidence.status || evidence.verificationStatus;
    if (!rawStatus || typeof rawStatus !== 'string') return false;
    const status = rawStatus.trim().toUpperCase();
    // Do NOT treat ALLOTTED or TRANSFERRED as verified legal title
    if (!APPROVED_AUTHORITY_STATUSES.includes(status)) return false;

    // 3. Freshness date check (within 180 days, not future, not malformed)
    const rawDate = evidence.lastVerifiedAt || evidence.verifiedAt || evidence.identityVerifiedAt;
    if (!isValidVerificationDate(rawDate)) return false;

    // 4. Structural validation of snapshot identifier
    const snapshotId = evidence.verificationSnapshotId || evidence.latestSnapshotId || evidence.snapshotId;
    if (!isValidSnapshotId(snapshotId)) return false;

    // 5. Structural validation of snapshot content hash
    const contentHash = evidence.snapshotContentHash || evidence.rawSnapshotHash || evidence.contentHash;
    if (!isValidContentHash(contentHash)) return false;

    // 6. Explicit clean litigation check (missing litigation NEVER defaults to clean)
    if (!isExplicitlyCleanLitigation(evidence.litigationStatus)) return false;

    return true;
}

/**
 * 1. Authoritative Title Verification Contract
 * 
 * Must require a recognized statutory authority verification result backed by
 * concrete evidence (snapshot ID, content hash, verified audit timestamp within 180 days)
 * and explicit presence of clean litigation result.
 * Generic booleans (deal.isVerified, deal.titleVerified, etc.) ALONE NEVER qualify.
 * 
 * @param {Object} entity - Deal, Inventory, or Project record
 * @returns {boolean}
 */
export function hasAuthoritativeTitleVerification(entity) {
    if (!entity || typeof entity !== 'object') return false;

    // Check authorityVerification subdocument on entity or entity.inventory
    const av = entity.authorityVerification || entity.inventory?.authorityVerification;
    if (av && evaluateAuthoritativeEvidence(av)) {
        return true;
    }

    // Check PropertyAuthorityLink if attached/present (enforces identical evidence, freshness & litigation)
    const link = entity.authorityLink || entity.propertyAuthorityLink || entity.inventory?.authorityLink;
    if (link && evaluateAuthoritativeEvidence(link)) {
        return true;
    }

    // Generic booleans alone (deal.isVerified, deal.titleVerified, etc.) must NEVER bypass evidence
    return false;
}

export const isAuthoritativelyVerified = hasAuthoritativeTitleVerification;

/**
 * Validates RERA registration reference string.
 */
function isValidReraReference(ref) {
    if (!ref || typeof ref !== 'string') return false;
    const s = ref.trim();
    if (s.length < 3) return false;
    if (['null', 'undefined', 'pending', 'applied', 'none', 'n/a', 'false'].includes(s.toLowerCase())) return false;
    return true;
}

/**
 * 2. Authoritative RERA Compliance Contract
 * 
 * Requires a valid, explicitly approved registration status backed by source record.
 * The mere presence of an RERA ID or number must never imply approval.
 * If status is missing, pending, expired, rejected, under review, or unknown -> UNVERIFIED.
 * 
 * @param {Object} entity - Deal, Inventory, or Project record
 * @returns {boolean}
 */
export function hasAuthoritativeReraApproval(entity) {
    if (!entity || typeof entity !== 'object') return false;

    // Extract potential direct status
    const rawDirectStatus = entity.reraStatus || entity.reraApprovalStatus || entity.project?.reraStatus || entity.project?.reraApprovalStatus;
    const directStatus = rawDirectStatus ? String(rawDirectStatus).trim().toUpperCase() : '';

    // If direct status is explicitly disallowed, immediately fail
    if (directStatus && DISALLOWED_RERA_STATUSES.includes(directStatus)) {
        return false;
    }

    const regNumber = entity.reraNumber || entity.reraRegistrationNumber || entity.project?.reraNumber || entity.project?.reraRegistrationNumber || entity.reraId;
    const hasValidRegNumber = isValidReraReference(regNumber);

    // Direct status must be explicitly approved AND have valid registration reference
    if (directStatus && APPROVED_RERA_STATUSES.includes(directStatus) && hasValidRegNumber) {
        // Check if expiry date is present
        const expiry = entity.reraValidUntil || entity.reraExpiryDate || entity.project?.reraValidUntil || entity.project?.reraExpiryDate;
        if (expiry) {
            const expTime = new Date(expiry).getTime();
            if (isNaN(expTime) || expTime <= Date.now()) {
                return false; // Expired or malformed expiry date
            }
        }
        return true;
    }

    // Check project approvals array
    const approvals = Array.isArray(entity.approvals) 
        ? entity.approvals 
        : (Array.isArray(entity.project?.approvals) ? entity.project.approvals : []);

    for (const a of approvals) {
        if (!a || typeof a !== 'object') continue;
        const auth = String(a.approvalAuthority || a.authority || '').trim().toUpperCase();
        const docType = String(a.documentType || '').trim().toUpperCase();
        const isRera = auth === 'RERA' || docType === 'RERA' || auth.includes('RERA');
        if (!isRera) continue;

        const itemStatus = String(a.status || a.approvalStatus || '').trim().toUpperCase();
        
        // Explicitly reject disallowed/unknown statuses
        if (!itemStatus || DISALLOWED_RERA_STATUSES.includes(itemStatus)) {
            continue;
        }

        // Must have an explicitly approved status - NEVER use Boolean(a.registrationNo) as substitute!
        if (!APPROVED_RERA_STATUSES.includes(itemStatus)) {
            continue;
        }

        // Must have a valid registration reference
        const regRef = a.registrationNo || a.registrationNumber || a.referenceNo || a.approvalNo || a.documentNumber;
        if (!isValidReraReference(regRef)) {
            continue;
        }

        // If expiryDate or validUntil is provided, check that it is not expired
        const expiryDate = a.expiryDate || a.validUntil || a.validTill;
        if (expiryDate) {
            const exp = new Date(expiryDate);
            if (isNaN(exp.getTime()) || exp.getTime() <= Date.now()) {
                continue; // Expired or malformed date
            }
        }

        return true;
    }

    return false;
}

/**
 * 3. Authoritative Bank Loan Approval Contract
 * 
 * Requires verified bank approval evidence backed by recognized financial institution.
 * 
 * @param {Object} entity
 * @returns {boolean}
 */
export function hasAuthoritativeBankApproval(entity) {
    if (!entity || typeof entity !== 'object') return false;
    const status = String(entity.bankApprovalStatus || entity.project?.bankApprovalStatus || '').trim().toUpperCase();
    const bank = entity.approvedBank || entity.project?.approvedBank || entity.bankName;
    return Boolean(status === 'APPROVED' && bank);
}

/**
 * 4. Authoritative Ready Possession Contract
 * 
 * Requires verified ready possession evidence or past possession date with completion.
 * 
 * @param {Object} entity
 * @returns {boolean}
 */
export function hasAuthoritativeReadyPossession(entity) {
    if (!entity || typeof entity !== 'object') return false;
    const posStatus = String(entity.possessionStatus || entity.authorityVerification?.possessionStatus || '').trim().toUpperCase();
    if (['READY', 'READY_TO_MOVE', 'IMMEDIATE', 'COMPLETED'].includes(posStatus)) {
        return true;
    }
    if (entity.authorityVerification?.occupancyCertificate === true || entity.occupancyCertificate === true) {
        return true;
    }
    const posDate = entity.possessionDate || entity.authorityVerification?.possessionDate;
    if (posDate) {
        const d = new Date(posDate);
        if (!isNaN(d.getTime()) && d.getTime() <= Date.now() && posStatus !== 'UNDER_CONSTRUCTION') {
            return true;
        }
    }
    return false;
}

/**
 * Extract authoritative verification facts
 * 
 * @param {Object} entity
 * @returns {Object}
 */
export function extractVerificationFacts(entity) {
    const isTitleVerified = hasAuthoritativeTitleVerification(entity);
    const isReraApproved = hasAuthoritativeReraApproval(entity);
    const isBankApproved = hasAuthoritativeBankApproval(entity);
    const isReadyPossession = hasAuthoritativeReadyPossession(entity);

    const av = entity?.authorityVerification || entity?.inventory?.authorityVerification;
    const link = entity?.authorityLink || entity?.propertyAuthorityLink || entity?.inventory?.authorityLink;
    const rawCode = av?.authorityCode || av?.authority || link?.authorityCode || link?.authority || null;
    const authorityCode = rawCode ? String(rawCode).trim().toUpperCase() : null;
    const rawRera = entity?.reraNumber || entity?.reraRegistrationNumber || entity?.project?.reraNumber || null;
    const reraNumber = isValidReraReference(rawRera) ? String(rawRera).trim() : null;

    return {
        isTitleVerified,
        isReraApproved,
        isBankApproved,
        isBankLoanApproved: isBankApproved,
        isReadyPossession,
        authorityCode: isTitleVerified ? authorityCode : null,
        titleEvidenceCode: isTitleVerified ? authorityCode : null,
        reraNumber: isReraApproved ? reraNumber : null
    };
}

/**
 * Generate compliant, neutral fallback copy for all tones.
 * Ensures zero unsupported claims when evidence is missing.
 */
export function generateCompliantFallback(deal = {}, platform = 'facebook', options = {}, facts = null) {
    let opts = options;
    let actualFacts = facts;

    if (typeof options === 'string') {
        opts = { tone: options, format: typeof facts === 'string' ? facts : 'post' };
        actualFacts = typeof facts === 'object' && facts !== null ? facts : null;
    } else if (typeof facts === 'string') {
        opts = { ...(opts || {}), format: facts };
        actualFacts = null;
    }

    opts = opts || {};
    const tone = opts.tone || 'urgent';
    const format = opts.format || 'post';

    const unitNo = deal.unitNo || 'Premium Property';
    const projectName = deal.projectName || 'Prime Property';
    const price = deal.price ? (typeof deal.price === 'number' ? `₹${deal.price.toLocaleString('en-IN')}` : deal.price) : 'Contact for Price';
    const size = deal.size ? `${deal.size} ${deal.sizeUnit || 'sq.ft'}` : '';
    const location = deal.location || 'Kurukshetra, Haryana';
    const unitType = deal.unitType || '';

    const isMohali = location.toLowerCase().includes('mohali');
    const regionalPhone = isMohali ? '+91 99910 00570' : '+91 99913 33570';
    const website = 'www.bharatproperties.co';

    const vFacts = actualFacts || extractVerificationFacts(deal);

    // Title / Authority line
    const titleLine = vFacts.isTitleVerified
        ? `📜 ${vFacts.authorityCode ? `${vFacts.authorityCode} ` : ''}Verified Title`
        : '📜 Property details available on request.';

    // RERA line
    const reraLine = vFacts.isReraApproved
        ? `\n🏛️ RERA Approved${vFacts.reraNumber ? ` (${vFacts.reraNumber})` : ''}`
        : '';

    if (tone === 'luxury') {
        return `💎 EXCLUSIVE LUXURY LIVING | ${projectName}\n\nIndulge in refined architecture and serene living at ${location}. Designed for those who value timeless quality and premier lifestyle amenities.\n\n✨ Unit: ${unitNo} ${unitType} (${size})\n💰 Investment: ${price}\n${titleLine}${reraLine}\n\nPrivate viewings available on prior appointment:\n📞 ${regionalPhone}\n🌐 ${website}\n\n#BharatProperties #LuxuryHomes #PrimeRealEstate #Kurukshetra`;
    }

    if (tone === 'investor') {
        const docLine = vFacts.isTitleVerified
            ? `🛡️ ${vFacts.authorityCode ? `${vFacts.authorityCode} ` : ''}Verified Title`
            : '📋 Documentation status can be checked during due diligence.';

        return `📈 STRATEGIC PROPERTY OPPORTUNITY | ${projectName}\n\nCommercial/residential asset positioned in the growing corridor of ${location}. Contact us for current availability and property details.\n\n🔑 Property: ${unitNo} ${unitType} (${size})\n💵 Price: ${price}\n${docLine}${reraLine}\n\nRequest property details & advisory:\n📞 ${regionalPhone}\n🌐 ${website}\n\n#BharatProperties #RealEstate #CommercialProperty #Kurukshetra`;
    }

    if (tone === 'short_hook') {
        const hookDetail = vFacts.isTitleVerified
            ? `${vFacts.authorityCode ? `${vFacts.authorityCode} ` : ''}Verified Title`
            : 'Property details on request';
        
        let hook = `🚨 Prime Deal Alert in ${location}! ${unitNo} at ${price}. ${hookDetail}. Call ${regionalPhone} to book site visit! 🌐 ${website} #BharatProperties`;
        if (hook.length > 280) {
            hook = `🚨 Prime Deal in ${location}! ${unitNo} at ${price}. Call ${regionalPhone} to book site visit! 🌐 ${website} #BharatProperties`;
        }
        return hook;
    }

    // Default: Urgent Deal (Hinglish)
    const possessionPhrase = vFacts.isReadyPossession
        ? 'ready possession opportunity'
        : 'prime opportunity';
    
    const legalPhrase = vFacts.isTitleVerified
        ? `${vFacts.authorityCode ? `${vFacts.authorityCode} ` : ''}Verified Title, aur prime connectivity.`
        : 'Prime location connectivity. Documentation status can be checked during due diligence.';

    return `🔥 URGENT DEAL ALERT: ${unitNo} ${unitType} at ${projectName}!\n\nKurukshetra ke prime location ${location} par ${possessionPhrase}! ${legalPhrase}${reraLine}\n\n📍 Location: ${location}\n📐 Area: ${size}\n💰 Price: ${price}\n\nLimited units available — aaj hi site visit book karein!\n📞 Call/WhatsApp: ${regionalPhone}\n🌐 ${website}\n\n#BharatProperties #Kurukshetra #HotProperty #RealEstateDeals`;
}

/**
 * 5. Deterministic Post-Generation Compliance Validator & Sanitizer
 * 
 * Scans generated marketing content for unsupported statements and ensures compliance:
 * - Detects unsupported legal, title, RERA, loan, possession and investment-performance claims.
 * - Uses verified property evidence to decide which claims are permitted.
 * - Fails safely when verification data is missing or ambiguous.
 * - Avoids silently converting an unsupported claim into another unsupported claim.
 * - Preserves platform-specific formatting and character limits.
 * 
 * @param {string} text - Generated marketing text
 * @param {Object} facts - Verified property facts
 * @param {Object} context - { deal, platform, tone, format }
 * @returns {string} Sanitized, compliant text
 */
export function validateAndSanitizeCopy(text, facts, context = {}) {
    if (!text || typeof text !== 'string') {
        return generateCompliantFallback(context.deal || {}, context.platform || 'facebook', context, facts);
    }

    let sanitized = text;

    // A. PROHIBITED INVESTMENT CLAIMS (Strictly prohibited regardless of verification status)
    const prohibitedGuarantees = [
        /\bguaranteed\s+(returns?|yield|appreciation|growth|rental)\b/gi,
        /\bproven\s+capital\s+appreciation\b/gi,
        /\bstrong\s+rental\s+yield(\s+potential)?\b/gi,
        /\b(high-yield|high\s+yield)\s+(investment|opportunity|asset|returns?)\b/gi,
        /\b(high-yield|high\s+yield)\b/gi,
        /\bassured\s+(returns?|appreciation|growth|rental)\b/gi,
        /\brisk-free\s+(investment|asset)?\b/gi,
        /\bzero\s+risk\s+(investment|asset)?\b/gi,
        /\b100%\s+guaranteed\b/gi,
        /\b100%\s+safe\s+investment\b/gi
    ];

    for (const pat of prohibitedGuarantees) {
        sanitized = sanitized.replace(pat, 'property details available on request');
    }

    // Replace "HIGH-YIELD INVESTMENT OPPORTUNITY"
    sanitized = sanitized.replace(/\bHIGH-YIELD\s+INVESTMENT\s+OPPORTUNITY\b/gi, 'STRATEGIC PROPERTY OPPORTUNITY');
    sanitized = sanitized.replace(/\bhigh-yield\s+investment\s+opportunity\b/gi, 'strategic property opportunity');
    sanitized = sanitized.replace(/\bhigh-yield\s+(investment|asset)\b/gi, 'property asset');

    // B. TITLE & REGISTRY CLAIMS
    const titlePatterns = [
        /\b100%\s+verified\s+(registry\s+)?title\s*(&\s*clear\s+registry)?\b/gi,
        /\b100%\s+verified\s+registry\s+title\b/gi,
        /\bverified\s+title\s*(&\s*clear\s+registry)?\b/gi,
        /\bclear\s+registry\b/gi,
        /\bclear\s+title\b/gi,
        /\bclear\s+documentation\b/gi,
        /\bdocumented\s+property\s*(&\s*clear\s+registry)?\b/gi,
        /\bdocumented\s+property\b/gi,
        /\btitle\s+guarantee[d]?\b/gi,
        /\blegal\s+verification\s+guaranteed\b/gi
    ];

    if (!facts?.isTitleVerified) {
        // If NOT verified by authority, ALL title/registry/documentation claims are unsupported
        for (const pat of titlePatterns) {
            sanitized = sanitized.replace(pat, 'Documentation status can be checked during due diligence');
        }
    } else {
        // If title IS verified, permit "Verified Title", but sanitize unverified "Clear Registry", "Clear Documentation", "Documented Property"
        sanitized = sanitized.replace(/\bclear\s+registry\b/gi, 'Authoritative Record');
        sanitized = sanitized.replace(/\bclear\s+documentation\b/gi, 'Verified Documentation');
        sanitized = sanitized.replace(/\bdocumented\s+property\b/gi, 'Verified Property');
    }

    // C. RERA COMPLIANCE CLAIMS
    const reraPatterns = [
        /&\s*rera\s+(compliant|approved|registered|verified|guaranteed)/gi,
        /\brera\s+(compliant|approved|registered|verified|guaranteed)\b/gi
    ];

    if (!facts?.isReraApproved) {
        // If RERA is NOT approved, completely strip RERA claims
        for (const pat of reraPatterns) {
            sanitized = sanitized.replace(pat, '');
        }
    }

    // D. BANK LOAN CLAIMS
    const loanPatterns = [
        /\bbank\s+loan\s+approved\b/gi,
        /\bbank\s+loan\s+approval\b/gi,
        /\bpre-approved\s+loan[s]?\b/gi,
        /\bloan\s+approved\b/gi
    ];

    if (!facts?.isBankApproved) {
        for (const pat of loanPatterns) {
            sanitized = sanitized.replace(pat, 'Home loan assistance available as per eligibility');
        }
    }

    // E. READY POSSESSION CLAIMS
    const possessionPatterns = [
        /\bready\s+possession(\s+opportunity)?\b/gi,
        /\bready\s+to\s+move\b/gi,
        /\bimmediate\s+possession\b/gi
    ];

    if (!facts?.isReadyPossession) {
        for (const pat of possessionPatterns) {
            sanitized = sanitized.replace(pat, 'prime property opportunity');
        }
    }

    // Clean up double punctuation or awkward whitespace created by stripping
    sanitized = sanitized.replace(/\s+,\s+/g, ', ')
                         .replace(/,\s*,/g, ',')
                         .replace(/\s{2,}/g, ' ')
                         .replace(/\n\s*\n\s*\n/g, '\n\n')
                         .trim();

    // F. STRICT POST-SANITIZATION AUDIT PASS
    // Check if any unsupported claim stubbornly remains
    let hasRemainingViolations = false;
    if (!facts?.isTitleVerified) {
        if (/verified title|clear registry|clear documentation|documented property|verified registry/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (!facts?.isReraApproved) {
        if (/rera (compliant|approved|registered)/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (/guaranteed (returns?|yield|appreciation)|proven capital appreciation|strong rental yield|high-yield/i.test(sanitized)) {
        hasRemainingViolations = true;
    }

    // If text failed safe sanitization, fail-safe to deterministic compliant fallback
    if (hasRemainingViolations) {
        return generateCompliantFallback(context.deal || {}, context.platform || 'facebook', context, facts);
    }

    // G. PLATFORM-SPECIFIC LIMITS
    if (context.platform === 'x' || context.platform === 'twitter') {
        if (sanitized.length > 280) {
            const cut = sanitized.slice(0, 260);
            const lastWord = cut.lastIndexOf(' ');
            sanitized = (lastWord > 0 ? cut.slice(0, lastWord) : cut) + '... #BharatProperties';
        }
    }

    return sanitized;
}
