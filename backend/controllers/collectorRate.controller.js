import CollectorRate from '../models/CollectorRate.js';

// Create a new rate
export const createCollectorRate = async (req, res) => {
    try {
        const {
            state, district, tehsil, location,
            category, subCategory, rate, rateApplyOn, rateUnit,
            roadMultipliers, floorMultipliers,
            effectiveFrom, effectiveTo, versionNo,
            configName, constructionRateSqFt, constructionRateSqYard
        } = req.body;

        // Basic validation
        if (!state || !district || !category || !subCategory || !rate || !configName || !effectiveFrom) {
            return res.status(400).json({ status: 'error', message: 'Please provide all required fields (State, District, Category, Sub-category, Rate, effectiveFrom, and Configuration)' });
        }

        const newRate = await CollectorRate.create({
            state, district, tehsil, location,
            category, subCategory, rate, rateApplyOn, rateUnit,
            roadMultipliers, floorMultipliers,
            effectiveFrom, effectiveTo, versionNo,
            configName, constructionRateSqFt, constructionRateSqYard,
            createdBy: req.user?._id
        });

        res.status(201).json({ status: 'success', data: newRate });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ status: 'error', message: 'A rate with these specific parameters already exists.' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Get all rates with filters and pagination
export const getAllCollectorRates = async (req, res) => {
    try {
        const { page = 1, limit = 10, state, district, category, subCategory, search } = req.query;
        const query = {};

        if (state) query.state = state;
        if (district) query.district = district;
        if (category) query.category = category;
        if (subCategory) query.subCategory = subCategory;

        if (search) {
            query.$or = [
                { category: { $regex: search, $options: 'i' } },
                { subCategory: { $regex: search, $options: 'i' } },
                { configName: { $regex: search, $options: 'i' } }
            ];
        }

        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { effectiveFrom: -1, createdAt: -1 }
        };

        const skip = (options.page - 1) * options.limit;

        const totalDocs = await CollectorRate.countDocuments(query);
        const rates = await CollectorRate.find(query)
            .populate('state', 'lookup_value')
            .populate('district', 'lookup_value')
            .populate('tehsil', 'lookup_value')
            .populate('location', 'lookup_value')
            .sort(options.sort)
            .skip(skip);

        res.json({
            status: 'success',
            data: {
                docs: rates,
                totalDocs,
                limit: options.limit,
                page: options.page,
                totalPages: Math.ceil(totalDocs / options.limit)
            }
        });

    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Update a rate
export const updateCollectorRate = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        updates.updatedBy = req.user?._id;

        const rate = await CollectorRate.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
            .populate('state', 'lookup_value')
            .populate('district', 'lookup_value')
            .populate('tehsil', 'lookup_value')
            .populate('location', 'lookup_value');

        if (!rate) {
            return res.status(404).json({ status: 'error', message: 'Rate not found' });
        }

        res.json({ status: 'success', data: rate });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Delete a rate
export const deleteCollectorRate = async (req, res) => {
    try {
        const { id } = req.params;
        const rate = await CollectorRate.findByIdAndDelete(id);

        if (!rate) {
            return res.status(404).json({ status: 'error', message: 'Rate not found' });
        }

        res.json({ status: 'success', message: 'Rate deleted successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
