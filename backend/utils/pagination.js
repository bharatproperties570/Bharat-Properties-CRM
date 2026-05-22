import '../models/Lookup.js'; // Ensure Lookup model is registered for population

/**
 * Enterprise Pagination Utility
 * - Parallel find + count (already was, kept)
 * - estimatedDocumentCount for unfiltered queries (10x faster than countDocuments)
 * - Lean queries for 30-50% memory/speed improvement on large result sets
 * - Smart field projection support
 */
export const paginate = async (model, query, page, limit, sort = {}, populate = "", collation = null, projection = null) => {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 25);
    const skip = (pageNum - 1) * limitNum;

    // Determine if query is "empty" (no filters) — use fast estimated count
    const isUnfiltered = !query || Object.keys(query).length === 0;

    try {
        let mongoQuery = model.find(query);

        // Apply projection if provided (reduces data transfer)
        if (projection) mongoQuery = mongoQuery.select(projection);

        mongoQuery = mongoQuery.sort(sort).skip(skip).limit(limitNum);

        if (collation) mongoQuery = mongoQuery.collation(collation);
        if (populate) mongoQuery = mongoQuery.populate(populate);

        // Run find + count in PARALLEL
        const [records, total] = await Promise.all([
            mongoQuery.lean(),
            // Use fast estimation for unfiltered, exact count for filtered
            isUnfiltered
                ? model.estimatedDocumentCount()
                : model.countDocuments(query)
        ]);

        return {
            records,
            totalCount: total,
            totalPages: Math.ceil(total / limitNum),
            currentPage: pageNum
        };
    } catch (error) {
        // Diagnostic check for Mock Mode
        const envConfig = (await import("../src/config/env.js")).default;
        if (envConfig && envConfig.mockMode) {
            console.warn(`[PAGINATION MOCK] Database unavailable, returning empty records for ${model.modelName}`);
            return { records: [], totalCount: 0, totalPages: 0, currentPage: Number(page) };
        }

        console.error(`[PAGINATION ERROR] Model: ${model.modelName} | Page: ${pageNum} | Limit: ${limitNum}`);
        console.error(`[PAGINATION ERROR] Error: ${error.message}`);

        // Fallback: retry without population
        if (populate) {
            console.warn(`[PAGINATION] Retrying without population for ${model.modelName}`);
            try {
                const [records, total] = await Promise.all([
                    model.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
                    isUnfiltered ? model.estimatedDocumentCount() : model.countDocuments(query)
                ]);
                return {
                    records,
                    totalCount: total,
                    totalPages: Math.ceil(total / limitNum),
                    currentPage: Number(page),
                    error: `Data partially loaded. Population failed: ${error.message}`
                };
            } catch (retryError) {
                console.error(`[PAGINATION FATAL] Retry failed: ${retryError.message}`);
                throw retryError;
            }
        }

        throw error;
    }
};


