import SystemSetting from "../models/SystemSetting.js";
import geminiService from "../services/GeminiService.js";
import openaiService from "../services/OpenAIService.js";
import claudeService from "../services/ClaudeService.js";

// Mock storage for when DB is unavailable
let mockSettingsStore = {};

// Helper to use DB or Mock
const isMockMode = process.env.MOCK_MODE === 'true';

// Get all system settings or filter by category
export const getSystemSettings = async (req, res) => {
    try {
        if (isMockMode) {
            console.log("⚠️ Serving System Settings from MOCK STORE");
            return res.json({ success: true, status: "success", data: Object.values(mockSettingsStore) });
        }

        const { category, isPublic, page = 1, limit = 100, search, configName } = req.query;
        const query = {};
        if (category) query.category = category;
        if (isPublic === 'true') query.isPublic = true;

        if (configName) {
            query['value.configName'] = { $regex: configName, $options: 'i' };
        }

        if (search) {
            query.$or = [
                { key: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { 'value.configName': { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const totalDocs = await SystemSetting.countDocuments(query);
        const settings = await SystemSetting.find(query)
            .sort({ key: 1 }) // Sort alphabetically for consistency
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        res.json({
            success: true,
            status: "success",
            data: {
                docs: settings,
                totalDocs,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalDocs / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, status: "error", message: error.message });
    }
};

// Get single setting by key
export const getSystemSettingByKey = async (req, res) => {
    try {
        const { key } = req.params;
        const setting = await SystemSetting.findOne({ key }).lean();
        if (!setting) return res.status(404).json({ success: false, status: "error", message: "Setting not found" });
        res.json({ success: true, status: "success", data: setting });
    } catch (error) {
        res.status(500).json({ success: false, status: "error", message: error.message });
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

        res.json({ success: true, status: "success", data: setting });
    } catch (error) {
        console.error("Upsert Setting Error:", error);
        res.status(500).json({ success: false, status: "error", message: error.message });
    }
};

// Test AI Provider Connection
export const testAiConnection = async (req, res) => {
    try {
        const { type, config } = req.body;
        console.log(`[SystemSetting] Testing AI Connection for: ${type}`);

        if (type === 'gemini') {
            const result = await geminiService.testConnection(config);
            return res.json(result);
        }

        if (type === 'openai') {
            const result = await openaiService.testConnection(config);
            return res.json(result);
        }

        if (type === 'claude') {
            const result = await claudeService.testConnection(config);
            return res.json(result);
        }

        // Add cases for openai, claude here in future phases
        res.status(400).json({ success: false, error: `Testing for ${type} is not yet implemented.` });
    } catch (error) {
        console.error("Test AI Connection Error:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// Delete a setting
export const deleteSystemSetting = async (req, res) => {
    try {
        const { key } = req.params;
        await SystemSetting.findOneAndDelete({ key });
        res.json({ success: true, status: "success", message: "Setting deleted" });
    } catch (error) {
        res.status(500).json({ success: false, status: "error", message: error.message });
    }
};
