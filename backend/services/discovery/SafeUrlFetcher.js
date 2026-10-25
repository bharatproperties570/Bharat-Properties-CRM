import axios from 'axios';
import net from 'net';
import dns from 'dns';
import http from 'http';
import https from 'https';
import { evaluateOperationAuthorization, evaluateOperationAuthorizationAsync, SOURCE_TIERS } from './SourceAuthorizationMatrix.js';

export class AuthorizationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'AuthorizationError';
        this.details = details;
    }
}

export class SSRFSecurityError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'SSRFSecurityError';
        this.details = details;
    }
}

/**
 * Checks whether an IPv4 or IPv6 address belongs to private, loopback,
 * link-local, carrier-grade NAT, multicast, or cloud metadata ranges.
 * 
 * @param {string} ipStr 
 * @returns {boolean} True if the IP is internal/private
 */
export function isPrivateOrInternalIp(ipStr) {
    if (!ipStr || typeof ipStr !== 'string') return true;
    const cleanIp = ipStr.trim().toLowerCase();

    const ipVersion = net.isIP(cleanIp);
    if (!ipVersion) return true; // Invalid IP is treated as unsafe

    if (ipVersion === 4) {
        const parts = cleanIp.split('.').map(Number);
        if (parts.length !== 4 || parts.some(isNaN)) return true;
        const [a, b, c, d] = parts;

        // 0.0.0.0/8 (Current network)
        if (a === 0) return true;

        // 10.0.0.0/8 (Private RFC 1918)
        if (a === 10) return true;

        // 100.64.0.0/10 (Carrier-grade NAT RFC 6598)
        if (a === 100 && (b >= 64 && b <= 127)) return true;

        // 127.0.0.0/8 (Loopback)
        if (a === 127) return true;

        // 169.254.0.0/16 (Link-local & Cloud Metadata: AWS/GCP/Azure: 169.254.169.254)
        if (a === 169 && b === 254) return true;

        // 172.16.0.0/12 (Private RFC 1918)
        if (a === 172 && (b >= 16 && b <= 31)) return true;

        // 192.0.0.0/24 (IETF Protocol Assignments)
        if (a === 192 && b === 0 && c === 0) return true;

        // 192.0.2.0/24 (TEST-NET-1)
        if (a === 192 && b === 0 && c === 2) return true;

        // 192.168.0.0/16 (Private RFC 1918)
        if (a === 192 && b === 168) return true;

        // 198.18.0.0/15 (Network benchmark tests RFC 2544)
        if (a === 198 && (b === 18 || b === 19)) return true;

        // 198.51.100.0/24 (TEST-NET-2)
        if (a === 198 && b === 51 && c === 100) return true;

        // 203.0.113.0/24 (TEST-NET-3)
        if (a === 203 && b === 0 && c === 113) return true;

        // 224.0.0.0/4 (Multicast)
        if (a >= 224 && a <= 239) return true;

        // 240.0.0.0/4 (Reserved / Future Use)
        if (a >= 240) return true;

        // 255.255.255.255 (Broadcast)
        if (a === 255 && b === 255 && c === 255 && d === 255) return true;

        return false;
    }

    if (ipVersion === 6) {
        // ::1 (IPv6 Loopback)
        if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1') return true;

        // :: (IPv6 Unspecified)
        if (cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:0') return true;

        // fe80::/10 (IPv6 Link-local)
        if (cleanIp.startsWith('fe8') || cleanIp.startsWith('fe9') || cleanIp.startsWith('fea') || cleanIp.startsWith('feb')) return true;

        // fc00::/7 (IPv6 Unique Local / Private RFC 4193)
        if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;

        // ::ffff:0:0/96 (IPv4-mapped IPv6)
        if (cleanIp.startsWith('::ffff:')) {
            const mappedV4 = cleanIp.replace('::ffff:', '');
            if (net.isIPv4(mappedV4)) {
                return isPrivateOrInternalIp(mappedV4);
            }
            return true;
        }

        return false;
    }

    return true;
}

/**
 * Validates a destination URL against scheme, known SSRF targets, and DNS resolution.
 * 
 * @param {string} rawUrl 
 * @returns {Promise<{ valid: boolean, hostname: string, resolvedIps: string[] }>}
 */
export async function validateDestinationSecurity(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        throw new SSRFSecurityError('Missing or invalid URL destination');
    }

    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch {
        throw new SSRFSecurityError('Malformed URL syntax');
    }

    // 1. Strict scheme check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new SSRFSecurityError(`Unsafe URL scheme: "${parsed.protocol}" (only http: and https: allowed)`);
    }

    const hostname = parsed.hostname.toLowerCase();

    // 2. Reject obvious dangerous hostnames
    const blockedHostnames = [
        'localhost',
        'metadata.google.internal',
        'metadata',
        'instance-data',
        '169.254.169.254',
        '0.0.0.0'
    ];

    if (blockedHostnames.includes(hostname) || hostname.endsWith('.localhost')) {
        throw new SSRFSecurityError(`Forbidden internal hostname: "${hostname}"`);
    }

    // 3. If hostname is an IP literal, validate directly
    if (net.isIP(hostname)) {
        if (isPrivateOrInternalIp(hostname)) {
            throw new SSRFSecurityError(`Access to private or internal IP address is blocked: ${hostname}`);
        }
        const fam = net.isIP(hostname);
        return { valid: true, hostname, resolvedIps: [hostname], pinnedIp: hostname, family: fam };
    }

    // 4. DNS Resolution & Rebinding Defense
    try {
        const lookupResults = await dns.promises.lookup(hostname, { all: true });
        if (!lookupResults || lookupResults.length === 0) {
            throw new SSRFSecurityError(`DNS resolution returned no addresses for "${hostname}"`);
        }

        const resolvedIps = lookupResults.map(r => r.address);
        for (const resolvedIp of resolvedIps) {
            if (isPrivateOrInternalIp(resolvedIp)) {
                throw new SSRFSecurityError(`DNS resolution for "${hostname}" resolved to forbidden private IP: ${resolvedIp}`);
            }
        }

        const primaryIp = resolvedIps[0];
        const fam = net.isIPv4(primaryIp) ? 4 : 6;
        return { valid: true, hostname, resolvedIps, pinnedIp: primaryIp, family: fam };
    } catch (err) {
        if (err instanceof SSRFSecurityError) throw err;
        throw new SSRFSecurityError(`DNS resolution failed for "${hostname}": ${err.message}`);
    }
}

/**
 * Creates an HTTP/HTTPS agent that pins socket connections to the validated IP.
 * The custom lookup validates that:
 * 1. The requested hostname matches the validated target hostname.
 * 2. DNS resolution at socket connection time does not resolve to private/internal IPs (DNS rebinding defense).
 * 3. The socket connects strictly to the validated, pinned IP address.
 * 4. Correct TLS certificate validation, SNI, and HTTP Host header behavior are preserved.
 *
 * @param {string} protocol 'http:' or 'https:'
 * @param {string} targetHostname The canonical target hostname
 * @param {string} pinnedIp The pre-validated public IP address
 * @param {number} family 4 or 6
 * @returns {http.Agent | https.Agent}
 */
export function createPinnedAgent(protocol, targetHostname, pinnedIp, family = 4) {
    const isHttps = protocol === 'https:';
    const AgentClass = isHttps ? https.Agent : http.Agent;

    return new AgentClass({
        keepAlive: false,
        maxSockets: 1,
        servername: targetHostname,
        lookup: (hostname, options, callback) => {
            const cleanHost = (hostname || '').toLowerCase();
            const cleanTarget = (targetHostname || '').toLowerCase();

            if (cleanHost !== cleanTarget) {
                return callback(new SSRFSecurityError(`Hostname mismatch in connection: expected "${cleanTarget}", got "${cleanHost}"`));
            }

            if (isPrivateOrInternalIp(pinnedIp)) {
                return callback(new SSRFSecurityError(`Connection to private or internal IP "${pinnedIp}" is strictly forbidden`));
            }

            // If target is an IP literal, return pinned IP directly
            if (net.isIP(cleanHost)) {
                if (options && options.all) {
                    return callback(null, [{ address: pinnedIp, family }]);
                }
                return callback(null, pinnedIp, family);
            }

            // Perform live connection-time DNS resolution to ensure DNS has not re-bound to a private/internal IP
            dns.lookup(cleanHost, { all: true }, (err, addresses) => {
                if (err) {
                    return callback(new SSRFSecurityError(`DNS lookup failed at connection time for "${cleanHost}": ${err.message}`));
                }

                if (!addresses || addresses.length === 0) {
                    return callback(new SSRFSecurityError(`DNS returned no addresses at connection time for "${cleanHost}"`));
                }

                // Check EVERY connection-time address
                for (const addr of addresses) {
                    if (isPrivateOrInternalIp(addr.address)) {
                        return callback(new SSRFSecurityError(
                            `DNS rebinding detected: "${cleanHost}" resolved to forbidden private/internal IP "${addr.address}" at connection time`
                        ));
                    }
                }

                const addressList = addresses.map(a => a.address);
                if (!addressList.includes(pinnedIp)) {
                    return callback(new SSRFSecurityError(
                        `DNS answer changed between validation (${pinnedIp}) and connection (${addressList.join(', ')}) for "${cleanHost}" (DNS rebinding detected)`
                    ));
                }

                // Connect using pinned IP
                if (options && options.all) {
                    return callback(null, [{ address: pinnedIp, family }]);
                }
                return callback(null, pinnedIp, family);
            });
        }
    });
}

/**
 * Executes an HTTP fetch with pre-flight authorization enforcement,
 * SSRF IP validation, connection-pinned agents, and safe bounded redirect handling.
 * 
 * @param {string} url 
 * @param {object} [options={}]
 * @param {number} [options.maxRedirects=3]
 * @param {number} [options.timeout=15000]
 * @param {object} [options.headers={}]
 * @returns {Promise<{ status: number, data: any, finalUrl: string, headers: object }>}
 */
export async function safeFetchHtml(url, options = {}) {
    const maxRedirects = options.maxRedirects !== undefined ? options.maxRedirects : 3;
    const timeout = options.timeout || 15000;
    const userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    let currentUrl = url;
    let redirectsRemaining = maxRedirects;

    while (true) {
        // Step 1: SSRF & Destination IP Security Gate (Pre-flight DNS & IP validation)
        const secInfo = await validateDestinationSecurity(currentUrl);

        // Step 2: Pre-flight Authorization Enforcement (BEFORE NETWORK CALL)
        const authDecision = await evaluateOperationAuthorizationAsync(currentUrl, 'automated_fetch');
        if (!authDecision.allowed) {
            throw new AuthorizationError(
                `Automated fetch blocked by source governance: ${authDecision.reason}`,
                authDecision
            );
        }

        // Step 3: Create connection-pinned agent to eliminate DNS-rebinding / TOCTOU gap
        let parsedUrl;
        try {
            parsedUrl = new URL(currentUrl);
        } catch {
            throw new SSRFSecurityError(`Malformed URL: ${currentUrl}`);
        }

        const agent = createPinnedAgent(
            parsedUrl.protocol,
            secInfo.hostname,
            secInfo.pinnedIp,
            secInfo.family
        );

        // Step 4: Execute HTTP request with maxRedirects: 0 to manually inspect redirects
        const response = await axios.get(currentUrl, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                ...options.headers
            },
            timeout,
            maxRedirects: 0,
            proxy: false, // Ensure outbound connection cannot bypass destination-IP safeguards via proxy configuration
            httpAgent: agent,
            httpsAgent: agent,
            validateStatus: (status) => (status >= 200 && status < 400)
        });

        // Step 5: Handle Redirects Safely (301, 302, 303, 307, 308)
        if (response.status >= 300 && response.status < 400) {
            const redirectLocation = response.headers.location;
            if (!redirectLocation) {
                throw new SSRFSecurityError(`Redirect received with status ${response.status} but no Location header`);
            }

            if (redirectsRemaining <= 0) {
                throw new SSRFSecurityError(`Too many redirects (exceeded maximum limit of ${maxRedirects})`);
            }

            redirectsRemaining--;

            // Resolve relative redirects against current URL
            let targetUrl;
            try {
                targetUrl = new URL(redirectLocation, currentUrl).toString();
            } catch {
                throw new SSRFSecurityError(`Malformed redirect location: "${redirectLocation}"`);
            }

            // Loop and validate targetUrl through the same gates
            currentUrl = targetUrl;
            continue;
        }

        return {
            status: response.status,
            data: response.data,
            finalUrl: currentUrl,
            headers: response.headers
        };
    }
}

export default {
    safeFetchHtml,
    validateDestinationSecurity,
    createPinnedAgent,
    isPrivateOrInternalIp,
    AuthorizationError,
    SSRFSecurityError
};
