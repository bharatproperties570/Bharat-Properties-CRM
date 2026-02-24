import ProspectEnrichmentRule from "../../../models/ProspectEnrichmentRule.js";
import IntentKeywordRule from "../../../models/IntentKeywordRule.js";
import EnrichmentLog from "../../../models/EnrichmentLog.js";
import Lead from "../../../models/Lead.js";
import { scanKeywords, calculateIntentIndex, classifyLead, detectMarginOpportunity } from "../../utils/enrichmentEngine.js";
import { AppError } from "../../middlewares/error.middleware.js";

/**
 * Get all enrichment rules
 */
export const getEnrichmentRules = async (req, res, next) => {
    try {
        const { type } = req.query;
        const query = {};
        if (type) query.type = type;

        const rules = await ProspectEnrichmentRule.find(query);
        const keywordRules = await IntentKeywordRule.find();

        res.status(200).json({
            success: true,
            data: {
                generalRules: rules,
                keywordRules
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create/Update Intent Keyword Rule
 */
export const saveKeywordRule = async (req, res, next) => {
    try {
        const { id, keyword, autoTag, roleType, intentImpact, isActive } = req.body;

        let rule;
        if (id) {
            rule = await IntentKeywordRule.findByIdAndUpdate(id, {
                keyword, autoTag, roleType, intentImpact, isActive
            }, { new: true });
        } else {
            rule = await IntentKeywordRule.create({
                keyword, autoTag, roleType, intentImpact, isActive
            });
        }

        res.status(200).json({ success: true, data: rule });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete Keyword Rule
 */
export const deleteKeywordRule = async (req, res, next) => {
    try {
        await IntentKeywordRule.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Rule deleted' });
    } catch (error) {
        next(error);
    }
};

/**
 * Run Manual Enrichment for a Lead
 */
export const runEnrichment = async (req, res, next) => {
    try {
        const { leadId } = req.params;

        await scanKeywords(leadId);
        await calculateIntentIndex(leadId);
        await classifyLead(leadId);

        const updatedLead = await Lead.findById(leadId);

        res.status(200).json({
            success: true,
            data: updatedLead
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Run Manual Margin Detection for a Deal
 */
export const runMarginDetection = async (req, res, next) => {
    try {
        const { dealId } = req.params;
        const result = await detectMarginOpportunity(dealId);
        res.status(200).json({ success: true, negotiation_window: result });
    } catch (error) {
        next(error);
    }
};

/**
 * Get Enrichment Logs
 */
export const getEnrichmentLogs = async (req, res, next) => {
    try {
        const { leadId } = req.query;
        const query = leadId ? { leadId } : {};
        const logs = await EnrichmentLog.find(query).sort({ timestamp: -1 }).limit(100);
        res.status(200).json({ success: true, data: logs });
    } catch (error) {
        next(error);
    }
};
