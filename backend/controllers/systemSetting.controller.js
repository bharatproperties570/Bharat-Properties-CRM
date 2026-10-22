import SystemSetting from "../src/modules/systemSettings/system.model.js";
import geminiService from "../services/GeminiService.js";
import openaiService from "../services/OpenAIService.js";
import claudeService from "../services/ClaudeService.js";
import { invalidateSequenceGuardCache } from "../src/services/SequenceGuardService.js";
import { invalidateRulesCache } from "../src/services/StageTransitionEngine.js";
import {
    getAvailableQualificationFields,
    getQualificationRule,
    invalidateQualificationRulesCache
} from "../utils/leadDataCompleteness.js";
import Lookup from "../models/Lookup.js";


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
        if (!setting) {
            return res.status(200).json({ 
                success: true, 
                status: "success", 
                data: null, 
                value: null, 
                message: "Setting not found" 
            });
        }
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

        // Rule Versioning for Stage Engine
        if (key === 'stage_transition_rules' && value && value.rules) {
            const existingSetting = await SystemSetting.findOne({ key }).lean();
            const prevVersion = existingSetting?.value?.version || 1;
            value.version = prevVersion + 1;
            value.lastUpdated = new Date();
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

        // Invalidate SequenceGuardService cache when sequenceConfig changes
        if (key === 'sequenceConfig') {
            invalidateSequenceGuardCache();
        }

        // Invalidate StageTransitionEngine rules cache when stage mappings change
        if (['stage_transition_rules', 'stageMappingRules', 'activityMasterFields'].includes(key)) {
            invalidateRulesCache();
        }

        // Invalidate stage qualification cache when stage_qualification_rules changes
        if (key === 'stage_qualification_rules') {
            invalidateQualificationRulesCache();
        }

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

// Get Stage Qualification Configuration (Rule + Available Fields + Stages)
export const getStageQualificationConfig = async (req, res) => {
    try {
        const [rule, fields, stageLookups] = await Promise.all([
            getQualificationRule(),
            getAvailableQualificationFields(),
            Lookup.find({ lookup_type: 'Stage', isActive: true }).select('lookup_value order').sort({ order: 1 }).lean().catch(() => [])
        ]);

        const stages = (stageLookups && stageLookups.length > 0)
            ? stageLookups.map(s => s.lookup_value)
            : ['Incoming', 'Prospect', 'Engaged', 'Opportunity', 'Negotiation', 'Won', 'Lost'];

        res.json({
            success: true,
            status: "success",
            data: {
                rule,
                fields,
                stages
            }
        });
    } catch (error) {
        console.error("[getStageQualificationConfig] Error:", error);
        res.status(500).json({ success: false, status: "error", message: error.message });
    }
};

// Re-evaluate and promote existing leads currently in Incoming
export const reEvaluateExistingLeadsQualification = async (req, res) => {
    try {
        const { evaluateLeadStageQualification, getQualificationRule } = await import("../utils/leadDataCompleteness.js");
        const Lead = (await import("../models/Lead.js")).default;
        const Lookup = (await import("../models/Lookup.js")).default;

        const rule = await getQualificationRule();
        if (!rule.enabled) {
            return res.status(400).json({
                success: false,
                message: "Stage Qualification Rule is currently disabled. Please enable it before running sync."
            });
        }

        const targetStageName = rule.targetStage || 'Prospect';
        const [incomingLookup, targetStageLookup] = await Promise.all([
            Lookup.findOne({ lookup_type: 'Stage', lookup_value: { $regex: /^Incoming$/i } }).lean(),
            Lookup.findOne({ lookup_type: 'Stage', lookup_value: new RegExp(`^${targetStageName}$`, 'i') }).lean()
        ]);

        if (!targetStageLookup) {
            return res.status(400).json({
                success: false,
                message: `Target stage "${targetStageName}" lookup not found in database.`
            });
        }

        const incomingQuery = {
            isDeleted: { $ne: true },
            isArchived: { $ne: true },
            $or: [
                ...(incomingLookup ? [{ stage: incomingLookup._id }] : []),
                { stage: 'Incoming' },
                { stage: null },
                { stage: { $exists: false } }
            ]
        };

        const incomingLeads = await Lead.find(incomingQuery).lean();
        console.log(`[BatchQualification] Found ${incomingLeads.length} incoming leads to evaluate.`);

        let promotedCount = 0;
        const now = new Date();
        const promotedDetails = [];

        for (const lead of incomingLeads) {
            const qual = await evaluateLeadStageQualification(lead);
            if (qual.qualified) {
                const historyEntry = {
                    stage: targetStageName,
                    enteredAt: now,
                    triggeredBy: 'batch_qualification_sync',
                    reason: `Batch promoted by Stage Qualification Rule (${qual.score}% data completeness)`
                };

                await Lead.findByIdAndUpdate(lead._id, {
                    $set: {
                        stage: targetStageLookup._id,
                        stageChangedAt: now
                    },
                    $push: { stageHistory: historyEntry }
                });

                promotedCount++;
                if (promotedDetails.length < 10) {
                    promotedDetails.push({
                        id: lead._id,
                        name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
                        score: `${qual.score}%`
                    });
                }
            }
        }

        console.log(`[BatchQualification] Successfully promoted ${promotedCount} of ${incomingLeads.length} leads to ${targetStageName}.`);

        res.json({
            success: true,
            status: "success",
            data: {
                totalScanned: incomingLeads.length,
                promotedCount,
                targetStage: targetStageName,
                samples: promotedDetails
            },
            message: `Evaluated ${incomingLeads.length} leads. Promoted ${promotedCount} qualified leads to ${targetStageName}!`
        });
    } catch (error) {
        console.error("[reEvaluateExistingLeadsQualification] Error:", error);
        res.status(500).json({ success: false, status: "error", message: error.message });
    }
};
