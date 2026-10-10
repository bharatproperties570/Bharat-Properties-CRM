import Lead from "../../models/Lead.js";

import IntentKeywordRule from "../../models/IntentKeywordRule.js";
import ProspectEnrichmentRule from "../../models/ProspectEnrichmentRule.js";
import EnrichmentLog from "../../models/EnrichmentLog.js";
import AuditLog from "../../models/AuditLog.js";
import LeadScoringService from "../services/LeadScoringService.js";
import Activity from "../../models/Activity.js";
import unifiedAIService from "../../services/UnifiedAIService.js";

/**
 * STEP 1: Calculate formula-based Intent Index from STATIC signals only.
 * Static signals = requirement depth, timeline, budget, isContacted.
 * Does NOT count activities (those are counted separately by leadScoring.js to avoid double-counting).
 * Returns the computed score (0-100) and saves it to lead.enrichment_score (separate field).
 */
export const calculateIntentIndex = async (leadId) => {
    const lead = await Lead.findById(leadId);
    if (!lead) return 0;

    // Default Weights (Admin can override via FORMULA rule)
    const formulaRule = await ProspectEnrichmentRule.findOne({ type: 'FORMULA', isActive: true });
    const weights = formulaRule?.config || {
        requirementDepth: 25,
        timelineUrgency: 25,
        budgetClarity: 20,
        contactReadiness: 20,   // renamed from visitReadiness (no longer counts Site Visits)
        responseSpeed: 10
    };

    let scores = {
        requirementDepth: 0,
        timelineUrgency: 0,
        budgetClarity: 0,
        contactReadiness: 0,
        responseSpeed: 0
    };

    // 1. Requirement Depth (purely static fields — no activity lookup)
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

    // 4. Contact Readiness (isContacted flag — NOT counting activities to avoid double-count)
    // Activities are scored separately by the frontend leadScoring.js engine
    if (lead.isContacted) {
        scores.contactReadiness = weights.contactReadiness * 0.5; // partial credit for being contacted
    }

    // 5. Response Speed (profile completeness as proxy)
    const hasEmail = !!lead.email;
    const hasPhone = !!lead.mobile;
    if (hasEmail && hasPhone) {
        scores.responseSpeed = weights.responseSpeed;
    } else if (hasPhone) {
        scores.responseSpeed = weights.responseSpeed * 0.6;
    }

    const formulaScore = Math.min(100, Math.round(Object.values(scores).reduce((a, b) => a + b, 0)));

    // Save formula score to a dedicated field (NOT intent_index yet — keywords will add to this)
    await Lead.findByIdAndUpdate(leadId, {
        enrichment_formula_score: formulaScore,
        enrichment_last_run: new Date()
    });

    return formulaScore;
};

/**
 * STEP 2: Scan lead text and activities for keyword matches.
 * ADDS keyword impact ON TOP of the formula score (does not overwrite it).
 * Saves the combined result to intent_index.
 */
export const scanKeywords = async (leadId) => {
    const lead = await Lead.findById(leadId);
    if (!lead) return;

    // ✅ FIX: Do NOT scan activity text here.
    // Activities are scored by LeadScoringService.computeAndSave() exclusively.
    // Scanning activity text here caused triple-counting:
    //   1. isContacted flag in calculateIntentIndex (Step 1)
    //   2. Activity subject/description text here (Step 2) ← REMOVED
    //   3. Frontend activityScore (now moved to LeadScoringService) ← REPLACED
    //
    // We only scan static lead text: description + notes.
    const keywordRules = await IntentKeywordRule.find({ isActive: true });

    let textToScan = `${lead.description || ''} ${lead.notes || ''}`.toLowerCase();

    let newTags = [...(lead.intent_tags || [])];
    let roleType = lead.role_type;
    let keywordImpactTotal = 0;

    // Start from the formula score computed in Step 1
    const formulaScore = lead.enrichment_formula_score || 0;

    for (const rule of keywordRules) {
        if (textToScan.includes(rule.keyword.toLowerCase())) {
            if (!newTags.includes(rule.autoTag)) {
                newTags.push(rule.autoTag);
            }
            if (!roleType || roleType === 'Buyer') {
                roleType = rule.roleType;
            }
            keywordImpactTotal += rule.intentImpact;

            await EnrichmentLog.create({
                leadId,
                ruleId: rule._id,
                ruleType: 'IntentKeywordRule',
                ruleName: `Keyword: ${rule.keyword}`,
                triggerType: 'KEYWORD',
                appliedTags: [rule.autoTag],
                oldIntentIndex: formulaScore,
                newIntentIndex: Math.min(100, formulaScore + keywordImpactTotal),
                details: { keyword: rule.keyword }
            });
        }
    }

    // Combined score = formula (static signals) + keyword boost
    const oldIntentIndex = lead.intent_index || 0;
    const finalIntentIndex = Math.min(100, Math.max(0, formulaScore + keywordImpactTotal));

    await Lead.findByIdAndUpdate(leadId, {
        intent_tags: newTags,
        role_type: roleType,
        intent_index: finalIntentIndex  // Combined: formula + keywords (no activities)
    });

    if (oldIntentIndex !== finalIntentIndex) {
        await AuditLog.logEntityUpdate(
            'score_changed',
            'lead',
            leadId,
            `${lead.firstName} ${lead.lastName}`,
            null,
            { before: oldIntentIndex, after: finalIntentIndex },
            `Enrichment engine recalculated intent_index: formula(${formulaScore}) + keyword_boost(${keywordImpactTotal}) = ${finalIntentIndex}`
        );
    }

    return { tags: newTags, roleType, intentIndex: finalIntentIndex };
};

/**
 * STEP 3: Classify Lead based on intent_index and tags.
 * Reads the final combined intent_index (formula + keywords).
 */
export const classifyLead = async (leadId) => {
    const lead = await Lead.findById(leadId);
    if (!lead) return;

    const classificationRules = await ProspectEnrichmentRule.find({ type: 'CLASSIFICATION', isActive: true });

    // Read the final combined score
    const score = lead.intent_index || 0;
    const tags = lead.intent_tags || [];

    let classification = "Explorer"; // Default

    // Tag-based classifications take priority
    if (tags.includes('ROI') || tags.includes('Investor')) {
        classification = "Investor";
    }

    // Score-based thresholds
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
 * Margin Opportunity Detection (for Deals — unchanged)
 */
export const detectMarginOpportunity = async (dealId) => {
    const Deal = (await import("../../models/Deal.js")).default;
    const deal = await Deal.findById(dealId);
    if (!deal) return false;

    const createdAt = deal.createdAt || new Date();
    const ageInDays = (new Date() - createdAt) / (1000 * 60 * 60 * 24);

    let isHighMargin = false;
    if (ageInDays > 30) isHighMargin = true;

    if (deal.quotePrice && deal.price) {
        const gap = (deal.quotePrice - deal.price) / deal.price;
        if (gap < 0.12) isHighMargin = true;
    }

    if (deal.remarks?.toLowerCase().includes('urgent') || deal.remarks?.toLowerCase().includes('immediate')) {
        isHighMargin = true;
    }

    await Deal.findByIdAndUpdate(dealId, { negotiation_window: isHighMargin });
    return isHighMargin;
};

/**
 * STEP 4: AI Deep Intent Analysis (LLM-based)
 * Analyzes activity history and notes to provide a human-like summary and probability.
 */
export const generateAIDeepIntent = async (leadId) => {
    const lead = await Lead.findById(leadId);
    if (!lead) return;

    // Fetch last 15 interactions
    const activities = await Activity.find({ entityId: leadId })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean();

    const notes = lead.notes || '';
    const interactionText = activities.map(a => 
        `[${new Date(a.createdAt).toLocaleDateString()}] ${a.type}: ${a.subject} (${a.completionResult || 'No Result'})`
    ).join('\n');

    const prompt = `
        You are a Real Estate Transaction Strategist. 
        Analyze the following prospect data and interaction history for a property lead.
        
        LEAD PROFILE:
        - Budget: ${lead.budgetMin} - ${lead.budgetMax}
        - Description: ${lead.description || 'N/A'}
        - Enrichment Tags: ${lead.intent_tags?.join(', ') || 'None'}
        - Current Notes: ${notes}
        
        RECENT INTERACTIONS:
        ${interactionText || 'No recent interactions logged.'}
        
        TASK:
        1. Summarize the prospect's "Deep Intent". Are they genuinely looking to close, or just exploring?
        2. Assign a "Closing Probability" (0 to 100) based on their engagement and requirement clarity.
        
        Return exactly in JSON format:
        {
            "summary": "Short 2-sentence professional analysis of intent",
            "probability": 85
        }
    `;

    try {
        const response = await unifiedAIService.generate(prompt);
        // Find JSON block in response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

        if (data) {
            await Lead.findByIdAndUpdate(leadId, {
                ai_intent_summary: data.summary,
                ai_closing_probability: data.probability
            });
            return data;
        }
    } catch (err) {
        console.error(`[AI_INTENT_ERROR] Lead ${leadId}:`, err.message);
    }
    return null;
};

/**
 * Full enrichment pipeline for a lead.
 * CORRECT ORDER:
 *   Step 1: calculateIntentIndex() — static formula (no activities)
 *   Step 2: scanKeywords()        — adds keyword boost on top of Step 1
 *   Step 3: classifyLead()        — reads combined result from Steps 1+2
 *
 * This eliminates the double-counting bug where Step 2 overwrote Step 1.
 */
export const runFullLeadEnrichment = async (leadId) => {
    try {
        await calculateIntentIndex(leadId);  // Step 1: static formula → enrichment_formula_score
        await scanKeywords(leadId);           // Step 2: keyword boost → intent_index (formula + keywords)
        await classifyLead(leadId);           // Step 3: classify using final intent_index
        
        // Step 4: [NEW] AI Deep Intent Analysis (LLM-based)
        await generateAIDeepIntent(leadId);
        
        // Step 5: Final Unified Scoring Recalculation (Backend v3 Engine)
        await LeadScoringService.computeAndSave(leadId, { triggeredBy: 'enrichment_completion' });

        return { success: true };
    } catch (error) {
        console.error(`[ENRICHMENT ERROR] Failed for lead ${leadId}:`, error);
        return { success: false, error: error.message };
    }
};
