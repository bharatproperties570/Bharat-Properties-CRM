import Lead from "../../models/Lead.js";
import Activity from "../../models/Activity.js";
import IntentKeywordRule from "../../models/IntentKeywordRule.js";
import ProspectEnrichmentRule from "../../models/ProspectEnrichmentRule.js";
import EnrichmentLog from "../../models/EnrichmentLog.js";

/**
 * Scan lead and activities for keywords and apply tags/intent impact
 */
export const scanKeywords = async (leadId) => {
    const lead = await Lead.findById(leadId);
    if (!lead) return;

    const activities = await Activity.find({ entityId: leadId, entityType: 'Lead' });
    const keywordRules = await IntentKeywordRule.find({ isActive: true });

    let textToScan = `${lead.description || ''} ${lead.notes || ''}`;
    activities.forEach(act => {
        textToScan += ` ${act.subject || ''} ${act.description || ''}`;
    });

    textToScan = textToScan.toLowerCase();

    let newTags = [...(lead.intent_tags || [])];
    let roleType = lead.role_type;
    let intentImpactTotal = 0;
    let oldIntentIndex = lead.intent_index || 0;

    for (const rule of keywordRules) {
        if (textToScan.includes(rule.keyword.toLowerCase())) {
            if (!newTags.includes(rule.autoTag)) {
                newTags.push(rule.autoTag);
            }
            // Role detection: keyword rules can assign role
            if (!roleType || roleType === 'Buyer') { // Simple priority logic
                roleType = rule.roleType;
            }
            intentImpactTotal += rule.intentImpact;

            // Log the trigger
            await EnrichmentLog.create({
                leadId,
                ruleId: rule._id,
                ruleType: 'IntentKeywordRule',
                ruleName: `Keyword: ${rule.keyword}`,
                triggerType: 'KEYWORD',
                appliedTags: [rule.autoTag],
                oldIntentIndex,
                newIntentIndex: Math.min(100, oldIntentIndex + rule.intentImpact),
                details: { keyword: rule.keyword }
            });
        }
    }

    const finalIntentIndex = Math.min(100, Math.max(0, oldIntentIndex + intentImpactTotal));

    await Lead.findByIdAndUpdate(leadId, {
        intent_tags: newTags,
        role_type: roleType,
        intent_index: finalIntentIndex,
        enrichment_last_run: new Date()
    });

    return { tags: newTags, roleType, intentIndex: finalIntentIndex };
};

/**
 * Calculate Intent Index based on requirement data and engagement
 */
export const calculateIntentIndex = async (leadId) => {
    const lead = await Lead.findById(leadId);
    if (!lead) return 0;

    // Default Weights (Admin can eventually override via FORMULA rule)
    const formulaRule = await ProspectEnrichmentRule.findOne({ type: 'FORMULA', isActive: true });
    const weights = formulaRule?.config || {
        requirementDepth: 25,
        timelineUrgency: 25,
        budgetClarity: 20,
        visitReadiness: 20,
        responseSpeed: 10
    };

    let scores = {
        requirementDepth: 0,
        timelineUrgency: 0,
        budgetClarity: 0,
        visitReadiness: 0,
        responseSpeed: 0
    };

    // 1. Requirement Depth (Requirement, PropertyType, Location etc.)
    if (lead.requirement) scores.requirementDepth += 5;
    if (lead.propertyType?.length > 0) scores.requirementDepth += 5;
    if (lead.location) scores.requirementDepth += 5;
    if (lead.projectName?.length > 0) scores.requirementDepth += 5;
    if (lead.description?.length > 50) scores.requirementDepth += 5;
    scores.requirementDepth = (scores.requirementDepth / 25) * weights.requirementDepth;

    // 2. Timeline Urgency
    const timeline = lead.timeline?.toLowerCase() || '';
    if (timeline.includes('immediate') || timeline.includes('urgent') || timeline.includes('this month')) {
        scores.timelineUrgency = weights.timelineUrgency;
    } else if (timeline.includes('1-3 months')) {
        scores.timelineUrgency = weights.timelineUrgency * 0.6;
    } else if (timeline.includes('3-6 months')) {
        scores.timelineUrgency = weights.timelineUrgency * 0.3;
    }

    // 3. Budget Clarity
    if (lead.budgetMin || lead.budgetMax) {
        scores.budgetClarity = weights.budgetClarity;
    } else if (lead.budget) {
        scores.budgetClarity = weights.budgetClarity * 0.7;
    }

    // 4. Visit Readiness (Has a Site Visit activity)
    const siteVisits = await Activity.countDocuments({
        entityId: leadId,
        entityType: 'Lead',
        type: { $in: ['Site Visit', 'Meeting'] }
    });
    if (siteVisits > 0) {
        scores.visitReadiness = weights.visitReadiness;
    }

    // 5. Response Speed (Simulated by 'isContacted' or recent activities)
    if (lead.isContacted) {
        scores.responseSpeed = weights.responseSpeed;
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const finalScore = Math.min(100, Math.round(totalScore));

    await Lead.findByIdAndUpdate(leadId, {
        intent_index: finalScore,
        enrichment_last_run: new Date()
    });

    return finalScore;
};

/**
 * Classify Lead based on intent_index and tags
 */
export const classifyLead = async (leadId) => {
    const lead = await Lead.findById(leadId);
    if (!lead) return;

    const classificationRules = await ProspectEnrichmentRule.find({ type: 'CLASSIFICATION', isActive: true });

    let classification = "Explorer"; // Default
    const score = lead.intent_index || 0;
    const tags = lead.intent_tags || [];

    // Prioritize specific tag-based classifications
    if (tags.includes('ROI') || tags.includes('Investor')) {
        classification = "Investor";
    }

    // Check score-based thresholds
    if (score > 80) classification = "Serious Buyer";
    else if (score > 60) classification = "Qualified";
    else if (score < 40) classification = "Low Intent";

    // Override with custom rules if any
    for (const rule of classificationRules) {
        const { threshold, label, tagRequired } = rule.config;
        if (tagRequired && tags.includes(tagRequired)) {
            classification = label;
            break;
        }
        if (threshold && score >= threshold) {
            classification = label;
        }
    }

    await Lead.findByIdAndUpdate(leadId, {
        lead_classification: classification
    });

    return classification;
};

/**
 * Margin Opportunity Detection (for Deals)
 */
export const detectMarginOpportunity = async (dealId) => {
    const Deal = (await import("../../models/Deal.js")).default; // Dynamic import if needed or just use regular if at top
    const deal = await Deal.findById(dealId);
    if (!deal) return false;

    // High Negotiation Window if:
    // - Seller urgency high (check tags or description?)
    // - Inventory age > 30 days
    // - Budget gap < 12%

    const createdAt = deal.createdAt || new Date();
    const ageInDays = (new Date() - createdAt) / (1000 * 60 * 60 * 24);

    let isHighMargin = false;

    if (ageInDays > 30) isHighMargin = true;

    // Price gap logic: (QuotePrice - Price) / Price
    if (deal.quotePrice && deal.price) {
        const gap = (deal.quotePrice - deal.price) / deal.price;
        if (gap < 0.12) isHighMargin = true;
    }

    if (deal.remarks?.toLowerCase().includes('urgent') || deal.remarks?.toLowerCase().includes('immediate')) {
        isHighMargin = true;
    }

    await Deal.findByIdAndUpdate(dealId, {
        negotiation_window: isHighMargin
    });

    return isHighMargin;
};

/**
 * Wrapper to run the full enrichment pipeline for a lead
 * @param {string} leadId 
 */
export const runFullLeadEnrichment = async (leadId) => {
    try {
        await scanKeywords(leadId);
        await calculateIntentIndex(leadId);
        await classifyLead(leadId);
        return { success: true };
    } catch (error) {
        console.error(`[ENRICHMENT ERROR] Failed for lead ${leadId}:`, error);
        return { success: false, error: error.message };
    }
};
