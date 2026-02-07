export const buildLeadFilter = (query) => {
    const filter = {};
    if (query.status) filter["status.class"] = query.status;
    if (query.source) filter.source = query.source;
    if (query.owner) filter.owner = query.owner;
    if (query.location) filter.location = { $regex: query.location, $options: 'i' };

    if (query.budgetMin || query.budgetMax) {
        filter.budgetMin = {};
        if (query.budgetMin) filter.budgetMin.$gte = Number(query.budgetMin);
        if (query.budgetMax) filter.budgetMin.$lte = Number(query.budgetMax);
    }

    return filter;
};
