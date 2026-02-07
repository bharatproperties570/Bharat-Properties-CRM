/**
 * Simple in-memory cache for lookups and rules
 * In production, consider using Redis for distributed caching
 */

class Cache {
    constructor() {
        this.store = new Map();
        this.ttl = new Map(); // Time to live
    }

    set(key, value, ttlSeconds = 3600) {
        this.store.set(key, value);

        if (ttlSeconds > 0) {
            const expiryTime = Date.now() + (ttlSeconds * 1000);
            this.ttl.set(key, expiryTime);

            // Auto-cleanup after TTL
            setTimeout(() => {
                this.delete(key);
            }, ttlSeconds * 1000);
        }
    }

    get(key) {
        // Check if expired
        if (this.ttl.has(key)) {
            if (Date.now() > this.ttl.get(key)) {
                this.delete(key);
                return null;
            }
        }

        return this.store.get(key) || null;
    }

    has(key) {
        return this.store.has(key) && this.get(key) !== null;
    }

    delete(key) {
        this.store.delete(key);
        this.ttl.delete(key);
    }

    clear() {
        this.store.clear();
        this.ttl.clear();
    }

    keys() {
        return Array.from(this.store.keys());
    }

    size() {
        return this.store.size;
    }
}

// Singleton instance
const cache = new Cache();

export default cache;
