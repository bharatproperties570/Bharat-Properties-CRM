/**
 * Permission Cache Service
 * Redis-based caching for user permissions
 */

import Redis from 'ioredis';

// Initialize Redis client (optional for development)
let redis = null;
let redisAvailable = false;

try {
    redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        lazyConnect: true, // Don't connect immediately
        retryStrategy: () => null, // Don't retry in development
        maxRetriesPerRequest: 1
    });

    redis.on('error', (err) => {
        if (!redisAvailable) {
            console.warn('⚠️  Redis not available - caching disabled (development mode)');
            redisAvailable = false;
        }
    });

    redis.on('connect', () => {
        console.log('✅ Redis connected for permission caching');
        redisAvailable = true;
    });

    // Try to connect
    redis.connect().catch(() => {
        console.warn('⚠️  Redis not available - caching disabled (development mode)');
        redisAvailable = false;
    });
} catch (error) {
    console.warn('⚠️  Redis initialization failed - caching disabled');
    redisAvailable = false;
}

// Cache TTL in seconds
const CACHE_TTL = {
    permissions: 300, // 5 minutes
    teamMembers: 600, // 10 minutes
    departmentUsers: 600, // 10 minutes
    roleData: 1800 // 30 minutes (roles change less frequently)
};

/**
 * Generate cache key
 */
const getCacheKey = (prefix, ...parts) => {
    return `${prefix}:${parts.join(':')}`;
};

/**
 * Cache user permissions
 */
export const cacheUserPermissions = async (userId, roleId, permissions) => {
    if (!redisAvailable || !redis) return;
    try {
        const key = getCacheKey('permissions', userId, roleId);
        await redis.setex(key, CACHE_TTL.permissions, JSON.stringify(permissions));
    } catch (error) {
        // Silently fail in development
    }
};

/**
 * Get cached user permissions
 */
export const getCachedUserPermissions = async (userId, roleId) => {
    if (!redisAvailable || !redis) return null;
    try {
        const key = getCacheKey('permissions', userId, roleId);
        const cached = await redis.get(key);

        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        // Silently fail in development
    }

    return null;
};

/**
 * Invalidate user permission cache
 */
export const invalidateUserPermissionCache = async (userId) => {
    const pattern = getCacheKey('permissions', userId, '*');
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
        await redis.del(...keys);
    }
};

/**
 * Cache team member IDs
 */
export const cacheTeamMembers = async (managerId, memberIds) => {
    const key = getCacheKey('team', managerId);
    await redis.setex(key, CACHE_TTL.teamMembers, JSON.stringify(memberIds));
};

/**
 * Get cached team member IDs
 */
export const getCachedTeamMembers = async (managerId) => {
    const key = getCacheKey('team', managerId);
    const cached = await redis.get(key);

    if (cached) {
        return JSON.parse(cached);
    }

    return null;
};

/**
 * Invalidate team cache
 */
export const invalidateTeamCache = async (managerId) => {
    const key = getCacheKey('team', managerId);
    await redis.del(key);
};

/**
 * Cache department user IDs
 */
export const cacheDepartmentUsers = async (department, userIds) => {
    const key = getCacheKey('department', department);
    await redis.setex(key, CACHE_TTL.departmentUsers, JSON.stringify(userIds));
};

/**
 * Get cached department user IDs
 */
export const getCachedDepartmentUsers = async (department) => {
    const key = getCacheKey('department', department);
    const cached = await redis.get(key);

    if (cached) {
        return JSON.parse(cached);
    }

    return null;
};

/**
 * Invalidate department cache
 */
export const invalidateDepartmentCache = async (department) => {
    const key = getCacheKey('department', department);
    await redis.del(key);
};

/**
 * Cache role data
 */
export const cacheRoleData = async (roleId, roleData) => {
    const key = getCacheKey('role', roleId);
    await redis.setex(key, CACHE_TTL.roleData, JSON.stringify(roleData));
};

/**
 * Get cached role data
 */
export const getCachedRoleData = async (roleId) => {
    const key = getCacheKey('role', roleId);
    const cached = await redis.get(key);

    if (cached) {
        return JSON.parse(cached);
    }

    return null;
};

/**
 * Invalidate role cache
 */
export const invalidateRoleCache = async (roleId) => {
    const key = getCacheKey('role', roleId);
    await redis.del(key);
};

/**
 * Invalidate all caches for a user (when user is updated)
 */
export const invalidateAllUserCaches = async (userId, department = null, reportingTo = null) => {
    // Invalidate user's own permission cache
    await invalidateUserPermissionCache(userId);

    // Invalidate team cache if user reports to someone
    if (reportingTo) {
        await invalidateTeamCache(reportingTo);
    }

    // Invalidate department cache
    if (department) {
        await invalidateDepartmentCache(department);
    }
};

/**
 * Invalidate all caches for a role (when role is updated)
 */
export const invalidateAllRoleCaches = async (roleId) => {
    // Invalidate role cache
    await invalidateRoleCache(roleId);

    // Invalidate all users with this role
    // Note: This requires getting all users with this role from DB
    // For now, we'll use a pattern match
    const pattern = getCacheKey('permissions', '*', roleId);
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
        await redis.del(...keys);
    }
};

/**
 * Clear all permission caches (use sparingly)
 */
export const clearAllCaches = async () => {
    await redis.flushdb();
};

/**
 * Get cache statistics
 */
export const getCacheStats = async () => {
    const info = await redis.info('stats');
    const keyspace = await redis.info('keyspace');

    return {
        info,
        keyspace,
        totalKeys: await redis.dbsize()
    };
};

export default {
    redis,
    cacheUserPermissions,
    getCachedUserPermissions,
    invalidateUserPermissionCache,
    cacheTeamMembers,
    getCachedTeamMembers,
    invalidateTeamCache,
    cacheDepartmentUsers,
    getCachedDepartmentUsers,
    invalidateDepartmentCache,
    cacheRoleData,
    getCachedRoleData,
    invalidateRoleCache,
    invalidateAllUserCaches,
    invalidateAllRoleCaches,
    clearAllCaches,
    getCacheStats
};
