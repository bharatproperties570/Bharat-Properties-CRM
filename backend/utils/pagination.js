export const paginate = async (model, query, page, limit, sort = {}) => {
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
        model.find(query).sort(sort).skip(skip).limit(limit).lean(),
        model.countDocuments(query)
    ]);

    return {
        records,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
    };
};
