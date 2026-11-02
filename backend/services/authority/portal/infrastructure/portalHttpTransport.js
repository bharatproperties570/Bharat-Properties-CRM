/**
 * Portal HTTP Transport
 *
 * Implements strict host allow-listing, manual redirect prevention,
 * and response byte ceiling for live authority requests.
 */

import { getPortalAdapter } from '../adapters/portalAdapterRegistry.js';

const ALLOWED_HOSTS = Object.freeze({
    HSVP: 'hsvphry.org.in',
    GMADA: 'gmadaipms.in',
    CHD: 'estateoffice.chd.gov.in'
});

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const portalHttpTransport = Object.freeze({
    /**
     * Executes read-only search on allow-listed authority portal.
     * @param {object} args
     * @param {string} args.authorityCode
     * @param {object} args.definition
     * @param {object} args.criteria
     * @param {boolean} [args.readOnly=true]
     * @param {boolean} [args.followRedirects=false]
     * @returns {Promise<object>} { status, headers, finalUrl, redirected, body }
     */
    async search({ authorityCode, definition, criteria, readOnly = true, followRedirects = false } = {}) {
        const code = String(authorityCode || '').trim().toUpperCase();
        const expectedHost = ALLOWED_HOSTS[code];

        if (!expectedHost) {
            const err = new Error(`PORTAL_HOST_NOT_ALLOWLISTED: Authority ${code} is not in the portal allow-list.`);
            err.code = 'PORTAL_HOST_NOT_ALLOWLISTED';
            throw err;
        }

        const targetUrl = new URL(definition.searchUrl);
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
        const reqConfig = adapter.buildSearchRequest(criteria);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        try {
            const response = await fetch(reqConfig.url, {
                method: reqConfig.method,
                headers: reqConfig.headers,
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

            // Read text with byte ceiling check
            const body = await response.text();
            if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) {
                const err = new Error('PORTAL_RESPONSE_TOO_LARGE: Portal response exceeded 2MB limit.');
                err.code = 'PORTAL_RESPONSE_TOO_LARGE';
                err.details = { pauseSource: true };
                throw err;
            }

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
