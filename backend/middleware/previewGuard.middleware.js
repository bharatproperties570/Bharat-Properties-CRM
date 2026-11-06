/**
 * Preview-to-Production Write Protection Middleware
 *
 * Enforces a strict server-side authorization boundary preventing Vercel Preview
 * environments (or any restricted preview identity) from mutating production data.
 *
 * Security Invariants:
 * 1. Safe read-only methods (GET, HEAD, OPTIONS) are permitted.
 * 2. Essential authentication endpoints (POST /api/auth/login, POST /api/auth/refresh,
 *    POST /api/auth/logout) are permitted to allow preview session inspection.
 * 3. All state-mutating requests (POST, PUT, PATCH, DELETE) to operational resources:
 *    - Leads, Lead Forms, Intake
 *    - Contacts, Contact Groups, Merge
 *    - Deals, Deal Forms, Bookings
 *    - Inventory, Projects, Collector Rates
 *    - Imports, Bulk Uploads
 *    - Communications, WhatsApp, SMS, Outbox, Campaigns
 *    - Authority Integrations
 *    - Settings, Field Rules, Scoring Rules, Admin Queues
 *    are strictly rejected with HTTP 403 Forbidden.
 * 4. Legitimate production users accessing through authorized production domains
 *    (e.g., crm.bharatproperties.co, bharatproperties.co) are unaffected.
 * 5. Direct API callers cannot bypass this guard by forging headers if the user token
 *    or origin is bound to a preview identity.
 */

// Production custom domains that are legitimate production hosts
const PRODUCTION_DOMAINS = Object.freeze([
    'crm.bharatproperties.co',
    'bharatproperties.co',
    'www.bharatproperties.co',
    'api.bharatproperties.co'
]);

// Auth routes explicitly permitted in preview mode for session establishment
const PERMITTED_PREVIEW_AUTH_PATHS = Object.freeze([
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/auth/logout'
]);

/**
 * Normalizes an origin/referer host string into a clean hostname (lowercase, no port).
 */
export function extractHostname(urlString) {
    if (!urlString || typeof urlString !== 'string') return null;
    try {
        const parsed = new URL(urlString.startsWith('http') ? urlString : `https://${urlString}`);
        return parsed.hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Determines whether a given request originates from, or is authenticated by,
 * a restricted Vercel Preview identity or environment.
 */
export function isRestrictedPreviewRequest(req) {
    if (!req) return false;

    // 1. Explicit User Identity flag (JWT claim or DB attribute)
    if (req.user) {
        if (req.user.isRestrictedPreview === true || req.user.previewOnly === true) return true;
        const roleName = String(req.user.role?.name || req.user.role || '').toLowerCase();
        if (roleName === 'preview' || roleName === 'restricted_preview' || roleName === 'guest_preview') {
            return true;
        }
    }

    // 2. Token payload claim before/during auth hydration
    if (req.auth && (req.auth.restrictedPreview === true || req.auth.isRestrictedPreview === true)) {
        return true;
    }

    // 3. Authorization header Bearer token inspection (e.g. CLI/curl without Origin/Referer)
    const authHeader = req.headers?.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        try {
            const tokenParts = authHeader.substring(7).trim().split('.');
            if (tokenParts.length >= 2) {
                const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf8'));
                if (payload.isRestrictedPreview === true || payload.previewOnly === true) return true;
                const tokenRole = String(payload.role?.name || payload.role || '').toLowerCase();
                if (tokenRole === 'preview' || tokenRole === 'restricted_preview' || tokenRole === 'guest_preview') {
                    return true;
                }
            }
        } catch {}
    }

    // 4. Explicit preview environment client header
    const previewHeader = req.headers['x-client-environment'] || req.headers['x-preview-mode'] || req.headers['x-vercel-deployment'];
    if (previewHeader && String(previewHeader).toLowerCase() === 'preview') {
        return true;
    }

    // 5. Origin or Referer header inspection (browser security prevents client forgery of Origin)
    const originHost = extractHostname(req.headers['origin']);
    const refererHost = extractHostname(req.headers['referer']);

    const isVercelHost = (h) => h && h.endsWith('.vercel.app');
    const isProductionCustomDomain = (h) => h && PRODUCTION_DOMAINS.some(d => h === d || h.endsWith(`.${d}`));

    if (originHost && isVercelHost(originHost) && !isProductionCustomDomain(originHost)) {
        return true;
    }

    if (refererHost && isVercelHost(refererHost) && !isProductionCustomDomain(refererHost)) {
        return true;
    }

    return false;
}

/**
 * Express middleware to enforce Preview Write Protection.
 */
export function previewWriteGuard(req, res, next) {
    const isPreview = isRestrictedPreviewRequest(req);

    if (!isPreview) {
        return next();
    }

    // Mark request as preview-constrained for downstream logging / metrics
    req.isPreviewRestricted = true;

    // Allow safe HTTP methods (GET, HEAD, OPTIONS)
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method.toUpperCase())) {
        return next();
    }

    // Allow essential authentication routes
    const requestPath = (req.originalUrl || req.url || '').split('?')[0];
    if (PERMITTED_PREVIEW_AUTH_PATHS.some(allowed => requestPath === allowed || requestPath.endsWith(allowed))) {
        return next();
    }

    // Block all other state-mutating requests
    console.warn(`[PREVIEW_WRITE_GUARD] 🚫 Blocked ${req.method} ${requestPath} from Preview context (Origin: ${req.headers['origin'] || req.headers['referer'] || 'N/A'}, User: ${req.user?.email || 'unauthenticated'})`);

    return res.status(403).json({
        success: false,
        code: 'PREVIEW_WRITE_PROHIBITED',
        message: 'Write operations are strictly disabled in Preview mode to protect production data integrity.',
        details: {
            method: req.method,
            path: requestPath,
            policy: 'PREVIEW_MUTATION_DENIED'
        }
    });
}

export default previewWriteGuard;
