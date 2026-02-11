export const paginate = async (model, query, page, limit, sort = {}, populate = "") => {
    const skip = (page - 1) * limit;

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
};

