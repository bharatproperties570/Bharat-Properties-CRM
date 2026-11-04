/**
 * Authority Portal Response Guard — no challenge bypass and no redirect chasing.
 * This module is intentionally transport-agnostic. It validates a response
 * returned by an explicitly injected, allow-listed transport.
 */

import { classifyAuthorityPortalResponse } from './authorityPortalSafety.js';

export const MAX_AUTHORITY_PORTAL_RESPONSE_BYTES = 2 * 1024 * 1024;

const CAPTCHA_OR_POLICY_PATTERNS = [
    /captcha/i,
    /verify\s+you\s+are\s+human/i,
    /security\s+check/i,
    /automated\s+traffic/i,
    /unusual\s+traffic/i,
    /access\s+denied/i,
    /terms\s+of\s+use\s+violation/i,
    /request\s+blocked/i
];

function makeError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = Object.freeze(details);
    return error;
}

function getHeader(headers, name) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || '';
    const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
    return key ? String(headers[key] ?? '') : '';
}

function safeUrlHost(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return null;
        return url.host.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Validates status, redirects, host, response size and challenge/login signals.
 * It never retries or follows a redirect. A caller must pause the source when
 * the returned error carries pauseSource=true.
 */
export function guardAuthorityPortalResponse({
    authorityCode,
    response,
    expectedUrl,
    maxBytes = MAX_AUTHORITY_PORTAL_RESPONSE_BYTES
} = {}) {
    if (!response || typeof response !== 'object') {
        throw makeError('PORTAL_RESPONSE_INVALID', 'Portal transport returned no valid response.');
    }

    const status = Number(response.status || 0);
    const body = typeof response.body === 'string' ? response.body : '';
    const location = getHeader(response.headers, 'location') || response.location || '';
    const finalUrl = String(response.finalUrl || expectedUrl || '');
    const expectedHost = safeUrlHost(expectedUrl);
    const finalHost = safeUrlHost(finalUrl);

    if (!expectedHost || !finalHost || finalHost !== expectedHost) {
        throw makeError('PORTAL_HOST_MISMATCH', 'Portal response host did not match the configured authority host.', {
            authorityCode,
            pauseSource: true
        });
    }

    if (response.redirected === true || (status >= 300 && status < 400)) {
        throw makeError('PORTAL_REDIRECT_BLOCKED', 'Portal returned a redirect; automatic redirect following is disabled.', {
            authorityCode,
            status,
            location: String(location).slice(0, 256),
            pauseSource: true
        });
    }

    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        throw makeError('PORTAL_RESPONSE_TOO_LARGE', 'Portal response exceeded the configured response-size ceiling.', {
            authorityCode,
            pauseSource: true
        });
    }

    const classification = classifyAuthorityPortalResponse({ status, body, location });
    if (classification.action === 'PAUSE_SOURCE') {
        throw makeError('PORTAL_SOURCE_PAUSED', 'Portal response triggered a source pause condition.', {
            authorityCode,
            reason: classification.reason,
            status,
            pauseSource: true,
            retry: false
        });
    }

    if (status === 401 || status === 407) {
        throw makeError('PORTAL_AUTH_REQUIRED', 'Portal requested authentication; no login attempt will be made.', {
            authorityCode,
            status,
            pauseSource: true
        });
    }

    if (CAPTCHA_OR_POLICY_PATTERNS.some((pattern) => pattern.test(body))) {
        throw makeError('PORTAL_CHALLENGE_OR_POLICY_BLOCK', 'Portal returned a challenge or policy-block response.', {
            authorityCode,
            status,
            pauseSource: true
        });
    }

    if (status < 200 || status >= 300) {
        throw makeError('PORTAL_HTTP_FAILURE', 'Portal returned a non-success HTTP response.', {
            authorityCode,
            status,
            retry: false
        });
    }

    return Object.freeze({
        authorityCode,
        status,
        body,
        finalUrl,
        contentType: getHeader(response.headers, 'content-type'),
        responseBytes: Buffer.byteLength(body, 'utf8')
    });
}
