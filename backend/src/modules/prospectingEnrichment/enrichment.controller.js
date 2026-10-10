import ProspectEnrichmentRule from "../../../models/ProspectEnrichmentRule.js";
import IntentKeywordRule from "../../../models/IntentKeywordRule.js";
import EnrichmentLog from "../../../models/EnrichmentLog.js";
import AuditLog from "../../../models/AuditLog.js";
import Lead from "../../../models/Lead.js";
import { scanKeywords, calculateIntentIndex, classifyLead, detectMarginOpportunity } from "../../utils/enrichmentEngine.js";
import { AuthorityProofIssuer } from "../../../utils/ServerAuthorityProof.js";
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
        let oldRule = null;
        if (id) {
            oldRule = await IntentKeywordRule.findById(id).lean();
            rule = await IntentKeywordRule.findByIdAndUpdate(id, {
                keyword, autoTag, roleType, intentImpact, isActive
            }, { new: true });
        } else {
            rule = await IntentKeywordRule.create({
                keyword, autoTag, roleType, intentImpact, isActive
            });
        }

        // Audit Rule Modification Track
        await AuditLog.logEntityUpdate(
            'rule_modified',
            'rule',
            rule._id,
            `Keyword Rule: ${rule.keyword}`,
            req.user?.id,
            { before: oldRule, after: rule },
            id ? `Keyword rule updated.` : `New keyword rule created.`
        );

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
 * Create/Update General Enrichment Rule (Formula, Classification, Margin)
 */
export const saveGeneralRule = async (req, res, next) => {
    try {
        const { type, name, config, isActive } = req.body;

        if (!type || !config) {
            return next(new AppError('Type and Config are required', 400));
        }

        // Upsert by type (since we usually only have one active rule per type: formula, classification, margin)
        const rule = await ProspectEnrichmentRule.findOneAndUpdate(
            { type },
            { name, config, isActive: isActive !== undefined ? isActive : true },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.status(200).json({ success: true, data: rule });
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

        const { authorizeTargetEntity } = await import('../../../utils/authorization.js');
        await authorizeTargetEntity(req.user, 'lead', leadId);

        const { withMongoTransaction } = await import('../../../utils/withMongoTransaction.js');
        const { DomainEventPublisher } = await import('../../../utils/DomainEventPublisher.js');
        const Lead = (await import('../../../models/Lead.js')).default;
        
        // Read state and OCC version marker BEFORE transaction
        const existingLead = await Lead.findById(leadId).lean();
        const currentStatus = existingLead?.enrichmentState?.status;
        const currentV = existingLead?.__v || 0;
        
        if (currentStatus === 'REQUESTED' || currentStatus === 'CLAIMED') {
            return res.status(409).json({
                success: false,
                message: 'Enrichment is already in progress.'
            });
        }

        await withMongoTransaction(async (session) => {
            // Atomic OCC-based transition inside transaction
            // Binds __v to prevent concurrent request retries from succeeding
            const result = await Lead.updateOne(
                { 
                    _id: leadId, 
                    "enrichmentState.status": { $in: ["COMPLETED", "NONE", "FAILED", null] },
                    __v: currentV
                }, 
                { 
                    $set: { "enrichmentState.status": "NONE" },
                    $inc: { __v: 1 }
                }, 
                { session }
            );

            if (result.matchedCount === 0) {
                // If 0, either another manual enrichment won the race, 
                // or a concurrent Lead update occurred. Fail safely.
                throw new Error("Concurrency conflict: Lead enrichment state changed before atomic transition.");
            }

            await DomainEventPublisher.publishFromHttp(req, session, {
                eventType: 'ManualEnrichmentRequested',
                aggregateType: 'Lead',
                aggregateId: leadId,
                payload: { requestedBy: req.user?._id }
            });
        });

        const updatedLead = await Lead.findById(leadId);

        res.status(200).json({
            success: true,
            data: updatedLead
        });
    } catch (error) {
        if (error.message.includes("Concurrency conflict")) {
            return res.status(409).json({
                success: false,
                message: 'Enrichment is already in progress or state changed concurrently.'
            });
        }
        next(error);
    }
};

/**
 * Run Manual Margin Detection for a Deal
 */
export const runMarginDetection = async (req, res, next) => {
    return next(new AppError('SECURITY_VIOLATION: Margin detection can only be triggered via authorized WEBHOOK pipelines.', 403));
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
