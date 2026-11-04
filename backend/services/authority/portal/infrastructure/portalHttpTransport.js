/**
 * Portal HTTP Transport
 *
 * Implements strict host allow-listing, manual redirect prevention,
 * session bootstrap with ephemeral anti-forgery extraction,
 * and streaming response byte ceiling for live authority requests.
 */

import { getPortalAdapter } from '../adapters/portalAdapterRegistry.js';
import { getAuthorityPortalDefinition } from '../authorityPortalDefinitions.js';

const ALLOWED_HOSTS = Object.freeze({
    HSVP: 'hsvphry.org.in',
    GMADA: 'gmadaipms.in',
    CHD: 'estateoffice.chd.gov.in'
});

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Extracts hidden input fields from an HTML string into an object.
 * @param {string} html
 * @returns {Record<string, string>}
 */
export function extractHiddenFields(html) {
    if (!html || typeof html !== 'string') return {};
    const fields = {};
    const regex = /<input[^>]+type=["']hidden["'][^>]*>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const tag = match[0];
        const nameMatch = /name=["']([^"']+)["']/i.exec(tag);
        const valMatch = /value=["']([^"']*)["']/i.exec(tag);
        if (nameMatch) {
            fields[nameMatch[1]] = valMatch ? valMatch[1] : '';
        }
    }
    return fields;
}

/**
 * Reads response body stream chunk-by-chunk with hard byte ceiling enforcement.
 * Aborts stream immediately if byte limit is exceeded.
 * @param {Response} response
 * @param {number} maxBytes
 * @param {AbortController} controller
 * @returns {Promise<string>}
 */
async function readStreamWithByteCeiling(response, maxBytes = MAX_BYTES, controller = null) {
    if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks = [];
        let totalBytes = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalBytes += value.byteLength;
                if (totalBytes > maxBytes) {
                    if (controller) controller.abort();
                    const err = new Error('PORTAL_RESPONSE_TOO_LARGE: Portal response exceeded 2MB limit.');
                    err.code = 'PORTAL_RESPONSE_TOO_LARGE';
                    err.details = { pauseSource: true };
                    throw err;
                }
                chunks.push(value);
            }
            const buffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
            return buffer.toString('utf8');
        } catch (err) {
            if (err.code === 'PORTAL_RESPONSE_TOO_LARGE') throw err;
            throw err;
        }
    } else {
        // Fallback for mock responses or environments without ReadableStream
        const bodyText = await response.text();
        if (Buffer.byteLength(bodyText, 'utf8') > maxBytes) {
            if (controller) controller.abort();
            const err = new Error('PORTAL_RESPONSE_TOO_LARGE: Portal response exceeded 2MB limit.');
            err.code = 'PORTAL_RESPONSE_TOO_LARGE';
            err.details = { pauseSource: true };
            throw err;
        }
        return bodyText;
    }
}

export const portalHttpTransport = Object.freeze({
    /**
     * Executes read-only search on allow-listed authority portal with anti-forgery session bootstrap.
     * @param {object} args
     * @param {string} args.authorityCode
     * @param {object} args.definition
     * @param {object} args.criteria
     * @param {boolean} [args.readOnly=true]
     * @param {boolean} [args.followRedirects=false]
     * @param {boolean} [args.bootstrapSession=true]
     * @returns {Promise<object>} { status, headers, finalUrl, redirected, body }
     */
    async search({ authorityCode, definition, criteria, readOnly = true, followRedirects = false, bootstrapSession = true } = {}) {
        const code = String(authorityCode || '').trim().toUpperCase();
        const expectedHost = ALLOWED_HOSTS[code];

        if (!expectedHost) {
            const err = new Error(`PORTAL_HOST_NOT_ALLOWLISTED: Authority ${code} is not in the portal allow-list.`);
            err.code = 'PORTAL_HOST_NOT_ALLOWLISTED';
            throw err;
        }

        const def = definition || getAuthorityPortalDefinition(code);
        const targetUrl = new URL(def?.searchUrl || `https://${expectedHost}/`);
        if (targetUrl.host.toLowerCase() !== expectedHost) {
            const err = new Error(`PORTAL_HOST_NOT_ALLOWLISTED: Target URL host ${targetUrl.host} does not match allowed host ${expectedHost}.`);
            err.code = 'PORTAL_HOST_NOT_ALLOWLISTED';
            throw err;
        }

        if (readOnly !== true) {
            const err = new Error('PORTAL_READ_ONLY_REQUIRED: Only read-only operations are permitted on authority portals.');
            err.code = 'PORTAL_READ_ONLY_REQUIRED';
            throw err;
        }

        const adapter = getPortalAdapter(code);
        let sessionCookies = '';
        let hiddenFields = {};

        // Phase 4.4.4 Session Bootstrap (P0.3):
        // Execute initial GET to capture ephemeral same-origin cookies and anti-forgery fields
        if (bootstrapSession) {
            const bootstrapController = new AbortController();
            const bootstrapTimeout = setTimeout(() => bootstrapController.abort(), DEFAULT_TIMEOUT_MS);
            try {
                const getResponse = await fetch(def.searchUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml',
                        'User-Agent': 'Mozilla/5.0 (compatible; BharatPropertiesCRM/1.0; AuthorityAuditEngine)'
                    },
                    redirect: 'manual',
                    signal: bootstrapController.signal
                });

                // P0.5 Fail-closed on bootstrap GET blocks
                if (getResponse.status >= 300 && getResponse.status < 400) {
                    const err = new Error(`PORTAL_UNEXPECTED_REDIRECT: Initial GET redirected with status ${getResponse.status}`);
                    err.code = 'PORTAL_UNEXPECTED_REDIRECT';
                    err.details = { pauseSource: true, status: getResponse.status };
                    throw err;
                }
                if (getResponse.status === 403) {
                    const err = new Error('PORTAL_ACCESS_DENIED: Initial session bootstrap returned 403 Forbidden.');
                    err.code = 'PORTAL_ACCESS_DENIED';
                    err.details = { pauseSource: true, status: 403 };
                    throw err;
                }
                if (getResponse.status === 429) {
                    const err = new Error('PORTAL_RATE_LIMITED: Initial session bootstrap returned 429 Too Many Requests.');
                    err.code = 'PORTAL_RATE_LIMITED';
                    err.details = { pauseSource: true, status: 429 };
                    throw err;
                }
                if (getResponse.status >= 500) {
                    const err = new Error(`PORTAL_UPSTREAM_ERROR: Initial session bootstrap returned HTTP ${getResponse.status}.`);
                    err.code = 'PORTAL_UPSTREAM_ERROR';
                    err.details = { pauseSource: true, status: getResponse.status };
                    throw err;
                }
                if (getResponse.status < 200 || getResponse.status >= 300) {
                    const err = new Error(`PORTAL_BOOTSTRAP_FAILED: Initial session bootstrap returned non-2xx status ${getResponse.status}.`);
                    err.code = 'PORTAL_BOOTSTRAP_FAILED';
                    err.details = { pauseSource: true, status: getResponse.status };
                    throw err;
                }

                // Collect Set-Cookie headers
                const rawCookies = [];
                if (typeof getResponse.headers.getSetCookie === 'function') {
                    rawCookies.push(...getResponse.headers.getSetCookie());
                } else if (getResponse.headers.get('set-cookie')) {
                    rawCookies.push(getResponse.headers.get('set-cookie'));
                }
                if (rawCookies.length > 0) {
                    sessionCookies = rawCookies.map(c => c.split(';')[0].trim()).join('; ');
                }

                const initialHtml = await readStreamWithByteCeiling(getResponse, MAX_BYTES, bootstrapController);
                const lowerHtml = initialHtml.toLowerCase();

                // Classify bootstrap HTML for blockers before any POST
                if (lowerHtml.includes('g-recaptcha') || lowerHtml.includes('cf-turnstile') || lowerHtml.includes('hcaptcha') || lowerHtml.includes('captcha') || lowerHtml.includes('enter the characters')) {
                    const err = new Error('PORTAL_CAPTCHA_REQUIRED: CAPTCHA challenge observed on bootstrap form.');
                    err.code = 'PORTAL_CAPTCHA_REQUIRED';
                    err.details = { pauseSource: true };
                    throw err;
                }
                if (lowerHtml.includes('please log in') || lowerHtml.includes('login required') || lowerHtml.includes('member login') || lowerHtml.includes('citizen login')) {
                    const err = new Error('PORTAL_LOGIN_WALL: Login wall encountered on bootstrap form.');
                    err.code = 'PORTAL_LOGIN_WALL';
                    err.details = { pauseSource: true };
                    throw err;
                }
                if (lowerHtml.includes('access denied') || lowerHtml.includes('unusual traffic') || lowerHtml.includes('policy block') || lowerHtml.includes('request blocked')) {
                    const err = new Error('PORTAL_ACCESS_DENIED: Access denied or security policy block encountered on bootstrap form.');
                    err.code = 'PORTAL_ACCESS_DENIED';
                    err.details = { pauseSource: true };
                    throw err;
                }

                // Validate form action target is on allowed host
                const formActionMatch = /<form[^>]+action=["']([^"']*)["']/i.exec(initialHtml);
                if (formActionMatch && formActionMatch[1]) {
                    const actionPath = formActionMatch[1].trim();
                    if (actionPath.startsWith('http://') || actionPath.startsWith('https://')) {
                        const parsedAction = new URL(actionPath);
                        if (parsedAction.host.toLowerCase() !== expectedHost) {
                            const err = new Error(`PORTAL_INVALID_FORM_ACTION: Form action host "${parsedAction.host}" does not match expected host "${expectedHost}".`);
                            err.code = 'PORTAL_INVALID_FORM_ACTION';
                            err.details = { pauseSource: true };
                            throw err;
                        }
                    }
                }

                hiddenFields = extractHiddenFields(initialHtml);

                // Require portal-specific anti-forgery / ViewState fields
                if (code === 'HSVP') {
                    if (!hiddenFields['__RequestVerificationToken'] && !hiddenFields['__CSRFTOKEN__']) {
                        const err = new Error('PORTAL_MISSING_ANTIFORGERY: HSVP bootstrap form missing __RequestVerificationToken.');
                        err.code = 'PORTAL_MISSING_ANTIFORGERY';
                        err.details = { pauseSource: true };
                        throw err;
                    }
                } else if (code === 'GMADA') {
                    if (!hiddenFields['__VIEWSTATE'] || !hiddenFields['__EVENTVALIDATION']) {
                        const err = new Error('PORTAL_MISSING_VIEWSTATE: GMADA bootstrap form missing __VIEWSTATE or __EVENTVALIDATION.');
                        err.code = 'PORTAL_MISSING_VIEWSTATE';
                        err.details = { pauseSource: true };
                        throw err;
                    }
                } else if (code === 'CHD') {
                    if (!hiddenFields['__RequestVerificationToken'] && !hiddenFields['__CSRFTOKEN__']) {
                        const err = new Error('PORTAL_MISSING_ANTIFORGERY: Chandigarh bootstrap form missing __RequestVerificationToken.');
                        err.code = 'PORTAL_MISSING_ANTIFORGERY';
                        err.details = { pauseSource: true };
                        throw err;
                    }
                }
            } catch (bootErr) {
                if (bootErr.name === 'AbortError') {
                    const err = new Error(`PORTAL_REQUEST_TIMEOUT: Initial session bootstrap to ${expectedHost} timed out.`);
                    err.code = 'PORTAL_REQUEST_TIMEOUT';
                    throw err;
                }
                throw bootErr;
            } finally {
                clearTimeout(bootstrapTimeout);
            }
        }

        // Build search request with anti-forgery state
        const adapterOptions = {
            verificationToken: hiddenFields['__RequestVerificationToken'] || hiddenFields['__CSRFTOKEN__'] || null,
            viewState: hiddenFields['__VIEWSTATE'] || null,
            viewStateGenerator: hiddenFields['__VIEWSTATEGENERATOR'] || null,
            eventValidation: hiddenFields['__EVENTVALIDATION'] || null
        };
        const reqConfig = adapter.buildSearchRequest(criteria, adapterOptions);

        const requestHeaders = { ...reqConfig.headers };
        if (sessionCookies) {
            requestHeaders['Cookie'] = sessionCookies;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        try {
            const response = await fetch(reqConfig.url, {
                method: reqConfig.method,
                headers: requestHeaders,
                body: reqConfig.body,
                redirect: followRedirects ? 'follow' : 'manual',
                signal: controller.signal
            });

            const status = response.status;
            const headersObj = {};
            response.headers.forEach((val, key) => {
                headersObj[key.toLowerCase()] = val;
            });

            const location = headersObj['location'] || '';
            const redirected = response.redirected || (status >= 300 && status < 400);

            // Verify content type is text/html or XML
            const contentType = (headersObj['content-type'] || '').toLowerCase();
            if (contentType && !contentType.includes('text/html') && !contentType.includes('xhtml') && !contentType.includes('text/plain')) {
                const err = new Error(`PORTAL_INVALID_CONTENT_TYPE: Expected HTML content type, received "${contentType}"`);
                err.code = 'PORTAL_INVALID_CONTENT_TYPE';
                err.details = { pauseSource: true, contentType };
                throw err;
            }

            // Read response stream chunk-by-chunk with byte ceiling enforcement (P1.5)
            const body = await readStreamWithByteCeiling(response, MAX_BYTES, controller);

            return Object.freeze({
                status,
                headers: Object.freeze(headersObj),
                finalUrl: response.url || reqConfig.url,
                redirected,
                location,
                body
            });
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                const err = new Error(`PORTAL_REQUEST_TIMEOUT: Request to ${expectedHost} timed out after ${DEFAULT_TIMEOUT_MS}ms.`);
                err.code = 'PORTAL_REQUEST_TIMEOUT';
                throw err;
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }
    }
});

export default portalHttpTransport;
