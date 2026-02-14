import CollectorRate from '../models/CollectorRate.js';

// Create a new rate
export const createCollectorRate = async (req, res) => {
    try {
        const { state, district, tehsil, category, rate, unit } = req.body;

        // Basic validation
        if (!state || !district || !category || !rate) {
            return res.status(400).json({ status: 'error', message: 'Please provide all required fields' });
        }

        const newRate = await CollectorRate.create({
            state,
            district,
            tehsil,
            category,
            rate,
            unit,
            createdBy: req.user?._id
        });

        res.status(201).json({ status: 'success', data: newRate });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ status: 'error', message: 'A rate for this location and category already exists.' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Get all rates with filters and pagination
export const getAllCollectorRates = async (req, res) => {
    try {
        const { page = 1, limit = 10, state, district, category } = req.query;
        const query = {};

        if (state) query.state = state;
        if (district) query.district = district;
        if (category) query.category = category;

        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            populate: [
                { path: 'state', select: 'lookup_value' },
                { path: 'district', select: 'lookup_value' },
                { path: 'tehsil', select: 'lookup_value' }
            ],
            sort: { createdAt: -1 }
        };

        // Use mongoose-paginate-v2 if available, else manual
        // Assuming paginate plugin is used or manual implementation
        // Check if model has paginate method (usually added via plugin)
        // If not, use standard find

        // For now, let's assume standard find/skip/limit for simplicity or add plugin if needed. 
        // But the user's codebase uses paginate in other controllers. Let's check a previous controller... 
        // Deal controller likely uses it. Let's risk using standard find first to be safe or just standard pagination.

        const skip = (options.page - 1) * options.limit;

        const totalDocs = await CollectorRate.countDocuments(query);
        const rates = await CollectorRate.find(query)
            .populate('state', 'lookup_value')
            .populate('district', 'lookup_value')
            .populate('tehsil', 'lookup_value')
            .sort(options.sort)
            .skip(skip)
            .limit(options.limit);

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
            .populate('tehsil', 'lookup_value');

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
