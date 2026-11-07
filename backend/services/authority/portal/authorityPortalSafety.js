/**
 * Conservative access policy for public authority search portals.
 * No CAPTCHA bypass, proxy rotation, identity masking, or control evasion.
 */

export const DEFAULT_AUTHORITY_PORTAL_POLICY = Object.freeze({
    enabled: false,
    readOnly: true,
    maxConcurrencyPerSource: 1,
    minimumIntervalMs: 15000,
    maxTransientRetries: 1,
    weeklyRefreshEnabled: false,
    stopOnCaptcha: true,
    stopOnLoginWall: true,
    stopOnForbidden: true,
    stopOnRateLimit: true
});

const CAPTCHA_PATTERNS = [
    /captcha/i,
    /verify\s+you\s+are\s+human/i,
    /security\s+check/i,
    /automated\s+traffic/i,
    /unusual\s+traffic/i,
    /bot\s+detection/i
];

const LOGIN_PATTERNS = [
    /name=["'](?:password|passwd)["']/i,
    /type=["']password["']/i,
    /sign\s*in\s+to\s+continue/i,
    /login\s+required/i,
    /session\s+expired/i
];

export function classifyAuthorityPortalResponse({ status = 0, body = '', location = '' } = {}) {
    const content = String(body || '');
    const redirect = String(location || '');
    const sanitizedContent = content.replace(/<input[^>]+(?:name|id)=["'][^"']*hfcaptcha[^"']*["'][^>]*>/gi, '');

    if (status === 403) {
        return Object.freeze({ action: 'PAUSE_SOURCE', reason: 'HTTP_403_FORBIDDEN', retry: false });
    }
    if (status === 429) {
        return Object.freeze({ action: 'PAUSE_SOURCE', reason: 'HTTP_429_RATE_LIMITED', retry: false, respectRetryAfter: true });
    }
    if (CAPTCHA_PATTERNS.some((pattern) => pattern.test(sanitizedContent))) {
        return Object.freeze({ action: 'PAUSE_SOURCE', reason: 'CAPTCHA_OR_CHALLENGE', retry: false });
    }
    if (
        LOGIN_PATTERNS.some((pattern) => pattern.test(content)) ||
        /(?:login|signin|account)/i.test(redirect)
    ) {
        return Object.freeze({ action: 'PAUSE_SOURCE', reason: 'LOGIN_OR_SESSION_REQUIRED', retry: false });
    }
    if (status >= 500) {
        return Object.freeze({ action: 'RETRY_LATER', reason: 'UPSTREAM_SERVER_ERROR', retry: true });
    }
    if (status >= 400 || status === 0) {
        return Object.freeze({ action: 'FAIL_ITEM', reason: 'HTTP_REQUEST_FAILED', retry: false });
    }
    return Object.freeze({ action: 'CONTINUE_TO_PARSER', reason: null, retry: false });
}

export function assertAuthorityPortalAutomationAllowed({
    policy = DEFAULT_AUTHORITY_PORTAL_POLICY,
    termsReviewed = false,
    sourcePaused = false
} = {}) {
    if (sourcePaused) {
        const error = new Error('AUTHORITY_PORTAL_PAUSED: Source is paused after a safety condition.');
        error.code = 'AUTHORITY_PORTAL_PAUSED';
        throw error;
    }
    if (!policy?.enabled) {
        const error = new Error('AUTHORITY_PORTAL_DISABLED: Live portal automation is disabled by default.');
        error.code = 'AUTHORITY_PORTAL_DISABLED';
        throw error;
    }
    if (policy.readOnly !== true) {
        const error = new Error('AUTHORITY_PORTAL_READ_ONLY_REQUIRED: Only read-only public search is supported.');
        error.code = 'AUTHORITY_PORTAL_READ_ONLY_REQUIRED';
        throw error;
    }
    if (!termsReviewed) {
        const error = new Error('AUTHORITY_PORTAL_TERMS_REVIEW_REQUIRED: Review source terms and access conditions before enabling automation.');
        error.code = 'AUTHORITY_PORTAL_TERMS_REVIEW_REQUIRED';
        throw error;
    }
    return true;
}

export function getNextPortalRequestAt({ now = Date.now(), lastRequestAt = null, minimumIntervalMs = DEFAULT_AUTHORITY_PORTAL_POLICY.minimumIntervalMs } = {}) {
    if (lastRequestAt === null || lastRequestAt === undefined) return new Date(now);
    return new Date(Math.max(now, Number(lastRequestAt) + minimumIntervalMs));
}
