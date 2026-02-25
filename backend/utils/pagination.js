export const paginate = async (model, query, page, limit, sort = {}, populate = "") => {
    const skip = (page - 1) * limit;

    try {
        let mongoQuery = model.find(query).sort(sort).skip(skip).limit(limit);

        if (populate) {
            mongoQuery = mongoQuery.populate(populate);
        }

        const [records, total] = await Promise.all([
            mongoQuery.lean(),
            model.countDocuments(query)
        ]);

        return {
            records,
            totalCount: total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page)
        };
    } catch (error) {
        console.error(`[PAGINATION ERROR] Model: ${model.modelName}, Query: ${JSON.stringify(query)}`);
        console.error(`[PAGINATION ERROR] Error Message: ${error.message}`);
        if (error.stack) console.error(`[PAGINATION ERROR] Stack: ${error.stack}`);

        // If it's a CastError, it might be in one of the records
        if (error.name === 'CastError') {
            console.error(`[PAGINATION ERROR] Cast Error Details: ${JSON.stringify(error)}`);
        }

        // If population fails, try fetching without population
        if (populate) {
            console.warn(`[PAGINATION] Retrying without population for ${model.modelName}...`);
            try {
                const [records, total] = await Promise.all([
                    model.find(query).sort(sort).skip(skip).limit(limit).lean(),
                    model.countDocuments(query)
                ]);

                return {
                    records,
                    totalCount: total,
                    totalPages: Math.ceil(total / limit),
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

