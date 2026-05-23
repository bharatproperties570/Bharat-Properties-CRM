/**
 * Enterprise API Cache Middleware
 * - In-memory LRU cache with TTL
 * - Auto-invalidates on write operations
 * - Zero external dependencies (no Redis needed)
 */

const DEFAULT_TTL = 60 * 1000; // 60 seconds
const MAX_SIZE = 500;           // max entries

class LRUCache {
    constructor(maxSize = MAX_SIZE) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        // LRU: move to end
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    set(key, value, ttl = DEFAULT_TTL) {
        if (this.cache.size >= this.maxSize) {
            // Evict oldest
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, { value, expiresAt: Date.now() + ttl });
    }

    invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        let count = 0;
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
            }
        }
        return count;
    }

    clear() { this.cache.clear(); }
    size() { return this.cache.size; }
}

export const apiCache = new LRUCache();

/**
 * Route-level TTL config (ms)
 */
const CACHE_ROUTES = {
    '/api/lookups':          5 * 60 * 1000,  // 5 min — rarely changes
    '/api/stages':           5 * 60 * 1000,  // 5 min
    '/api/users':            2 * 60 * 1000,  // 2 min
    '/api/roles':            5 * 60 * 1000,  // 5 min
    '/api/teams':            2 * 60 * 1000,  // 2 min
    '/api/projects':         2 * 60 * 1000,  // 2 min
    '/api/property-config':  5 * 60 * 1000,  // 5 min
    '/api/pipeline-stats':   30 * 1000,       // 30s — dashboard stats
    '/api/stage-engine':     30 * 1000,       // 30s
};

/**
 * Routes to invalidate cache when modified
 */
const INVALIDATION_MAP = {
    '/api/lookups':    ['/api/lookups', '/api/stages'],
    '/api/users':      ['/api/users', '/api/teams'],
    '/api/teams':      ['/api/teams', '/api/users'],
    '/api/projects':   ['/api/projects'],
    '/api/leads':      ['/api/pipeline-stats', '/api/stage-engine'],
    '/api/contacts':   ['/api/pipeline-stats'],
    '/api/deals':      ['/api/pipeline-stats'],
};

/**
 * Cache middleware factory
 */
export function cacheMiddleware(customTtl = null) {
    return (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') return next();

        // Determine TTL
        const basePath = '/' + req.path.split('/').slice(1, 3).join('/');
        const ttl = customTtl || CACHE_ROUTES[basePath];
        if (!ttl) return next();

        // Cache key: path + query + user scope
        const userId = req.user?._id || req.user?.id || 'anon';
        const cachePath = req.originalUrl || req.url;
        const cacheKey = `${cachePath}|${userId}`;

        const cached = apiCache.get(cacheKey);
        if (cached) {
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('X-Cache-TTL', ttl);
            return res.json(cached);
        }

        // Intercept response
        const originalJson = res.json.bind(res);
        res.json = (data) => {
            if (res.statusCode === 200 && data?.success !== false) {
                apiCache.set(cacheKey, data, ttl);
            }
            res.setHeader('X-Cache', 'MISS');
            return originalJson(data);
        };

        next();
    };
}

/**
 * Cache invalidation middleware — call after writes
 */
export function invalidateCache(req, res, next) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const basePath = '/' + req.path.split('/').slice(1, 3).join('/');
        const patterns = INVALIDATION_MAP[basePath] || [];
        patterns.forEach(p => {
            const count = apiCache.invalidatePattern(p.replace('/api/', ''));
            if (count > 0) console.log(`[Cache] Invalidated ${count} entries for ${p}`);
        });
    }
    next();
}

/**
 * Apply smart caching to router
 */
export function applySmartCache(router, path, ttl) {
    router.use(path, cacheMiddleware(ttl));
}
