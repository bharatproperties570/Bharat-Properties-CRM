import Inventory from "../models/Inventory.js";
import mockStore from "../utils/mockStore.js";
import { paginate } from "../utils/pagination.js";

/**
 * @desc    Get all inventory
 * @route   GET /inventory
 * @access  Private
 */
export const getInventory = async (req, res) => {
    try {
        if (process.env.MOCK_MODE === 'true') {
            return res.json({ success: true, data: mockStore.inventory });
        }

        const { page = 1, limit = 25, search = "", projectId, block, projectName } = req.query;
        let query = {};

        if (projectId) query.projectId = projectId;
        if (block) query.block = block;
        if (projectName) query.projectName = projectName;

        if (req.query.area) query.projectName = req.query.area; // Alias support
        if (req.query.location) query.block = req.query.location; // Alias support

        if (search) {
            query = {
                ...query,
                $or: [
                    { unitNo: { $regex: search, $options: "i" } },
                    { unitNumber: { $regex: search, $options: "i" } }, // Add unitNumber support
                    { ownerName: { $regex: search, $options: "i" } },
                    { city: { $regex: search, $options: "i" } },
                    { locArea: { $regex: search, $options: "i" } }
                ]
            };
        }

        const populateFields = "owners associates";
        // Sort by _id desc to ensure newest items come first (more reliable than createdAt for mixed legacy data)
        const results = await paginate(Inventory, query, Number(page), Number(limit), { _id: -1 }, populateFields);

        res.json({
            success: true,
            ...results
        });
    } catch (error) {
        console.error("GET /inventory error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};


/**
 * @desc    Add new inventory
 * @route   POST /inventory
 * @access  Private
 */
export const addInventory = async (req, res) => {
    try {
        const inventory = await Inventory.create(req.body);
        res.status(201).json({ success: true, data: inventory });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Update inventory
 * @route   PUT /inventory/:id
 * @access  Private
 */
export const updateInventory = async (req, res) => {
    try {
        const inventory = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!inventory) return res.status(404).json({ success: false, error: "Inventory not found" });
        res.json({ success: true, data: inventory });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Delete inventory
 * @route   DELETE /inventory/:id
 * @access  Private
 */
export const deleteInventory = async (req, res) => {
    try {
        const inventory = await Inventory.findByIdAndDelete(req.params.id);
        if (!inventory) return res.status(404).json({ success: false, error: "Inventory not found" });
        res.json({ success: true, message: "Inventory deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const bulkDeleteInventory = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: "Invalid IDs provided" });
        }
        await Inventory.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, message: `${ids.length} inventory items deleted successfully` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

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

        const { budgetMin, budgetMax, city, propertyType, category, subCategory } = req.query;

        const query = {
            price: { $gte: Number(budgetMin) || 0, $lte: Number(budgetMax) || Infinity },
            status: "Available"
        };

        if (city) query.city = city;
        if (propertyType) query.category = propertyType; // Support legacy matching
        if (category) query.category = category;
        if (subCategory) query.subCategory = subCategory;

        const results = await Inventory.find(query).limit(50).lean();

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
