import Lookup from "./lookup.model.js";
import cache from "../../utils/cache.js";
import { AppError } from "../../middlewares/error.middleware.js";

const CACHE_TTL = 3600; // 1 hour

/**
 * Get lookups by type with caching
 */
export const getLookupsByType = async (req, res, next) => {
    try {
        const { type } = req.params;
        const { active = 'true', parentValue } = req.query;

        const cacheKey = `lookups:${type}:${active}:${parentValue || 'all'}`;

        // Check cache first
        let lookups = cache.get(cacheKey);

        if (!lookups) {
            const query = { type };

            if (active !== undefined) query.active = active === 'true';
            if (parentValue) query.parentValue = parentValue;

            lookups = await Lookup.find(query).sort({ order: 1, label: 1 });

            // Cache the results
            cache.set(cacheKey, lookups, CACHE_TTL);
        }

        res.status(200).json({
            success: true,
            count: lookups.length,
            data: lookups
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all lookup types
 */
export const getAllLookups = async (req, res, next) => {
    try {
        const lookups = await Lookup.find().sort({ type: 1, order: 1 });

        // Group by type
        const grouped = lookups.reduce((acc, lookup) => {
            if (!acc[lookup.type]) {
                acc[lookup.type] = [];
            }
            acc[lookup.type].push(lookup);
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: grouped
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create lookup
 */
export const createLookup = async (req, res, next) => {
    try {
        const lookup = await Lookup.create(req.body);

        // Invalidate cache for this type
        invalidateCache(lookup.type);

        res.status(201).json({
            success: true,
            data: lookup
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update lookup
 */
export const updateLookup = async (req, res, next) => {
    try {
        const lookup = await Lookup.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!lookup) {
            throw new AppError('Lookup not found', 404);
        }

        // Invalidate cache for this type
        invalidateCache(lookup.type);

        res.status(200).json({
            success: true,
            data: lookup
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete lookup
 */
export const deleteLookup = async (req, res, next) => {
    try {
        const lookup = await Lookup.findByIdAndDelete(req.params.id);

        if (!lookup) {
            throw new AppError('Lookup not found', 404);
        }

        // Invalidate cache for this type
        invalidateCache(lookup.type);

        res.status(200).json({
            success: true,
            message: 'Lookup deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Bulk create lookups
 */
export const bulkCreateLookups = async (req, res, next) => {
    try {
        const { lookups } = req.body;

        if (!Array.isArray(lookups) || lookups.length === 0) {
            throw new AppError('Please provide an array of lookups', 400);
        }

        const created = await Lookup.insertMany(lookups);

        // Invalidate all caches
        cache.clear();

        res.status(201).json({
            success: true,
            count: created.length,
            data: created
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Helper function to invalidate cache for a specific type
 */
const invalidateCache = (type) => {
    const keys = cache.keys();
    keys.forEach(key => {
        if (key.startsWith(`lookups:${type}:`)) {
            cache.delete(key);
        }
    });
};
