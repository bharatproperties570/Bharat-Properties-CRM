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
            currentPage: page
        };
    } catch (error) {
        // If it's a CastError during population, retry without population
        if (error.name === 'CastError' && populate) {
            console.warn(`[PAGINATION] CastError during population for model ${model.modelName}. Retrying without population.`, error.message);

            const [records, total] = await Promise.all([
                model.find(query).sort(sort).skip(skip).limit(limit).lean(),
                model.countDocuments(query)
            ]);

            return {
                records,
                totalCount: total,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                warning: "Data returned without population due to schema casting errors."
            };
        }
        throw error;
    }
};

