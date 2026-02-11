import SystemSetting from "../models/SystemSetting.js";

// Mock storage for when DB is unavailable
let mockSettingsStore = {};

// Helper to use DB or Mock
const isMockMode = process.env.MOCK_MODE === 'true';

// Get all system settings or filter by category
export const getSystemSettings = async (req, res) => {
    try {
        if (isMockMode) {
            console.log("⚠️ Serving System Settings from MOCK STORE");
            return res.json({ status: "success", data: Object.values(mockSettingsStore) });
        }

        const { category, isPublic } = req.query;
        const query = {};
        if (category) query.category = category;
        if (isPublic === 'true') query.isPublic = true;

        const settings = await SystemSetting.find(query).lean();
        // Convert array to object map for easier frontend consumption if needed, 
        // but for now return list and let frontend handle mapping
        res.json({ status: "success", data: settings });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// Get single setting by key
export const getSystemSettingByKey = async (req, res) => {
    try {
        const { key } = req.params;
        const setting = await SystemSetting.findOne({ key }).lean();
        if (!setting) return res.status(404).json({ status: "error", message: "Setting not found" });
        res.json({ status: "success", data: setting });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// Create or Update (Upsert) a setting
export const upsertSystemSetting = async (req, res) => {
    try {
        const { key, value, category, description, isPublic } = req.body;

        if (!key || value === undefined) {
            return res.status(400).json({ status: "error", message: "Key and Value are required" });
        }

        if (isMockMode) {
            console.log(`⚠️ Upserting System Settings to MOCK STORE: ${key}`);
            const setting = {
                key,
                value,
                category: category || 'general',
                description,
                isPublic: isPublic || false,
                updatedBy: 'mock-user',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            mockSettingsStore[key] = setting;
            return res.json({ status: "success", data: setting });
        }

        const setting = await SystemSetting.findOneAndUpdate(
            { key },
            {
                $set: {
                    value,
                    category: category || 'general',
                    description,
                    isPublic: isPublic || false,
                    updatedBy: req.user?._id // Assuming auth middleware populates user
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json({ status: "success", data: setting });
    } catch (error) {
        console.error("Upsert Setting Error:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// Delete a setting
export const deleteSystemSetting = async (req, res) => {
    try {
        const { key } = req.params;
        await SystemSetting.findOneAndDelete({ key });
        res.json({ status: "success", message: "Setting deleted" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};
