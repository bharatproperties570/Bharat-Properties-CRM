import Inventory from "../models/Inventory.js";
import mockStore from "../utils/mockStore.js";

/**
 * @desc    Match inventory based on criteria
 * @route   GET /inventory/match
 * @access  Private
 */
export const matchInventory = async (req, res) => {
    try {
        if (process.env.MOCK_MODE === 'true') {
            return res.json({ success: true, data: mockStore.inventory });
        }

        const { budgetMin, budgetMax, city, propertyType } = req.query;

        const query = {
            price: { $gte: Number(budgetMin) || 0, $lte: Number(budgetMax) || Infinity },
            status: "Available"
        };

        if (city) query.city = city;
        if (propertyType) query.propertyType = propertyType;

        const results = await Inventory.find(query).limit(50).lean();

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
