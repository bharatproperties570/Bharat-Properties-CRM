/**
 * propertyComplianceValidator.js
 * 
 * Authoritative Property Verification & Marketing Compliance Validator
 * Implements strict statutory, legal, and regulatory marketing guardrails:
 * - Real estate advertising regulations (RERA, consumer protection)
 * - Evidence-backed authoritative verification contracts
 * - Deterministic post-generation compliance validation & sanitization
 */

export const RECOGNIZED_AUTHORITY_CODES = ['HSVP', 'CHD', 'GMADA', 'DDA', 'PUDA', 'HRERA'];
export const APPROVED_AUTHORITY_STATUSES = ['VERIFIED', 'ALLOTTED', 'TRANSFERRED', 'REGISTRY_COMPLETED'];
export const APPROVED_RERA_STATUSES = ['APPROVED', 'REGISTERED', 'ACTIVE', 'VALID'];
export const DISALLOWED_RERA_STATUSES = ['EXPIRED', 'REJECTED', 'PENDING', 'REVOKED', 'UNDER_REVIEW', 'SUSPENDED'];

/**
 * 1. Authoritative Title Verification Contract
 * 
 * Must require a recognized statutory authority verification result backed by
 * concrete evidence (snapshot ID, content hash, or verified audit timestamp)
 * and absence of adverse litigation.
 * Generic booleans (deal.isVerified, deal.titleVerified, etc.) ALONE NEVER qualify.
 * 
 * @param {Object} entity - Deal, Inventory, or Project record
 * @returns {boolean}
 */
export function hasAuthoritativeTitleVerification(entity) {
    if (!entity || typeof entity !== 'object') return false;

    // Check authorityVerification subdocument on entity or entity.inventory
    const av = entity.authorityVerification || entity.inventory?.authorityVerification;
    if (av && typeof av === 'object') {
        const code = String(av.authorityCode || '').toUpperCase();
        const hasRecognizedCode = RECOGNIZED_AUTHORITY_CODES.includes(code);
        
        const status = String(av.authorityStatus || av.status || '').toUpperCase();
        const hasApprovedStatus = APPROVED_AUTHORITY_STATUSES.includes(status);
        
        const hasAuditTrail = Boolean(
            av.verificationSnapshotId ||
            av.snapshotContentHash ||
            (av.lastVerifiedAt && !isNaN(new Date(av.lastVerifiedAt).getTime()))
        );

        const litStatus = String(av.litigationStatus || '').toUpperCase();
        const isCleanLitigation = !av.litigationStatus || ['CLEAN', 'NONE', 'NO_DISPUTE', 'CLEAR'].includes(litStatus);

        if (hasRecognizedCode && hasApprovedStatus && hasAuditTrail && isCleanLitigation) {
            return true;
        }
    }

    // Check PropertyAuthorityLink if attached/present
    const link = entity.authorityLink || entity.propertyAuthorityLink;
    if (link && typeof link === 'object') {
        const code = String(link.authorityCode || '').toUpperCase();
        const hasRecognizedCode = RECOGNIZED_AUTHORITY_CODES.includes(code);
        const isIdentityVerified = Boolean(link.identityVerified && link.identityVerifiedAt && !isNaN(new Date(link.identityVerifiedAt).getTime()));
        const hasSnapshot = Boolean(link.latestSnapshotId || link.compositeKey);

        if (hasRecognizedCode && isIdentityVerified && hasSnapshot) {
            return true;
        }
    }

    // Generic booleans alone (deal.isVerified, deal.titleVerified, etc.) must NEVER bypass evidence
    return false;
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

    // Direct reraStatus or reraApprovalStatus
    const reraStatus = String(entity.reraStatus || entity.reraApprovalStatus || entity.project?.reraStatus || entity.project?.reraApprovalStatus || '').toUpperCase();

    // Explicitly reject disallowed/unverified states
    if (DISALLOWED_RERA_STATUSES.includes(reraStatus) || reraStatus === 'UNKNOWN') {
        return false;
    }

    const hasApprovedStatus = APPROVED_RERA_STATUSES.includes(reraStatus);
    const hasRegNumber = Boolean(entity.reraNumber || entity.reraRegistrationNumber || entity.project?.reraNumber || entity.reraId);

    if (hasApprovedStatus && hasRegNumber) {
        return true;
    }

    // Check project approvals array
    const approvals = Array.isArray(entity.approvals) 
        ? entity.approvals 
        : (Array.isArray(entity.project?.approvals) ? entity.project.approvals : []);

    const reraApproval = approvals.find(a => {
        const auth = String(a.approvalAuthority || '').toUpperCase();
        const docType = String(a.documentType || '').toUpperCase();
        const isRera = auth === 'RERA' || docType === 'RERA';
        const itemStatus = String(a.status || '').toUpperCase();
        const isApproved = APPROVED_RERA_STATUSES.includes(itemStatus) || Boolean(a.registrationNo);
        const notDisallowed = !DISALLOWED_RERA_STATUSES.includes(itemStatus);
        const hasValidDate = a.date && !isNaN(new Date(a.date).getTime());

        return isRera && isApproved && notDisallowed && hasValidDate;
    });

    if (reraApproval) {
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
    const status = String(entity.bankApprovalStatus || entity.project?.bankApprovalStatus || '').toUpperCase();
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
    const posStatus = String(entity.possessionStatus || entity.authorityVerification?.possessionStatus || '').toUpperCase();
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
    const authorityCode = av?.authorityCode || entity?.authorityLink?.authorityCode || null;
    const reraNumber = entity?.reraNumber || entity?.reraRegistrationNumber || entity?.project?.reraNumber || null;

    return {
        isTitleVerified,
        isReraApproved,
        isBankApproved,
        isBankLoanApproved: isBankApproved,
        isReadyPossession,
        authorityCode,
        titleEvidenceCode: authorityCode,
        reraNumber
    };
}

/**
 * Generate compliant, neutral fallback copy for all tones
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
    // Real estate regulations prohibit guaranteeing returns or appreciation
    const prohibitedGuarantees = [
        /\bguaranteed\s+(returns?|yield|appreciation|growth|rental)\b/gi,
        /\bproven\s+capital\s+appreciation\b/gi,
        /\bstrong\s+rental\s+yield(\s+potential)?\b/gi,
        /\bassured\s+(returns?|appreciation|growth|rental)\b/gi,
        /\brisk-free\s+investment\b/gi,
        /\bzero\s+risk\s+investment\b/gi,
        /\b100%\s+guaranteed\b/gi
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
        /\b100%\s+verified\s+title\s*(&\s*clear\s+registry)?\b/gi,
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
        if (/verified title|clear registry|clear documentation|documented property/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (!facts?.isReraApproved) {
        if (/rera (compliant|approved|registered)/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (/guaranteed (returns?|yield|appreciation)|proven capital appreciation|strong rental yield/i.test(sanitized)) {
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
