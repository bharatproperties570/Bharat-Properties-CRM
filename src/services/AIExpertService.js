/**
 * AI Expert Service - Advanced Logic for CRM Intelligence
 * Provides AI-driven insights for leads, inventory, and assignments.
 */

import { calculateLeadScore } from '../utils/leadScoring';

class AIExpertService {
    /**
     * Explain a lead's score with natural language insights
     */
    explainLeadScore(lead, config) {
        const scoreData = calculateLeadScore(lead, lead.activities || [], config);
        const { score, breakdown, temperature, intent } = scoreData;

        const insights = [];

        // Enrichment-based Insights (Backend Intelligence)
        if (lead.intentIndex > 70 || lead.intent_index > 70) {
            insights.push("High behavioral intent detected by enrichment engine.");
        }
        if (lead.classification === 'Serious Buyer' || lead.lead_classification === 'Serious Buyer') {
            insights.push("Classified as a Serious Buyer - prioritize for immediate closure.");
        }
        if (lead.intentTags && lead.intentTags.includes('ROI')) {
            insights.push("Lead is heavily focused on ROI and investment potential.");
        }

        // Positive Interaction Insights
        if (breakdown.attribute > 50) insights.push("Strong requirement alignment with current portfolio.");
        if (breakdown.activity > 30) insights.push("Highly engaged lead with multiple recent interactions.");
        if (breakdown.source > 15) insights.push("High-intent source (e.g. Website/Referral).");
        if (breakdown.fit > 15) insights.push("Perfect match found in premium inventory.");

        // Negative/Risk Insights
        if (breakdown.decay < -10) insights.push("Risk of cooling off due to inactivity.");
        if (lead.stage === 'Lost') insights.push("Marked as Lost - requires re-engagement strategy.");

        // Combine scores (frontend + backend weighting)
        const finalScore = Math.max(score, lead.intentIndex || lead.intent_index || 0);

        return {
            score: finalScore,
            temperature,
            intent,
            breakdown,
            classification: lead.classification || lead.lead_classification,
            intentTags: lead.intentTags || lead.intent_tags || [],
            summary: insights.slice(0, 3).join(' '),
            fullExplanation: insights.length > 0 ? insights : ["Waiting for more interaction data for detailed insights."]
        };
    }

    /**
     * Match a property to interested leads
     */
    matchInventoryToLeads(property, leads) {
        if (!property || !leads) return [];

        return leads.map(lead => {
            let matchScore = 0;
            const reasons = [];

            // Location Match
            if (lead.preferredLocation === property.location) {
                matchScore += 40;
                reasons.push("Preferred Location");
            } else if (lead.location === property.sector) {
                matchScore += 20;
                reasons.push("Sector Match");
            }

            // Budget Match
            if (lead.budgetMin && lead.budgetMax) {
                const propPrice = parseFloat(property.price?.replace(/[^0-9.]/g, '') || 0);
                if (propPrice >= lead.budgetMin && propPrice <= lead.budgetMax) {
                    matchScore += 30;
                    reasons.push("Within Budget");
                }
            }

            // Type Match
            if (lead.propertyType && property.type && lead.propertyType.includes(property.type)) {
                matchScore += 30;
                reasons.push("Property Type Match");
            }

            return {
                leadId: lead.id || lead.mobile,
                leadName: lead.name,
                matchScore: Math.min(matchScore, 100),
                reasons
            };
        })
            .filter(m => m.matchScore > 50)
            .sort((a, b) => b.matchScore - a.matchScore);
    }

    /**
     * Propose the best agent for an assignment
     */
    proposeAgent(entity, agents, workload = {}) {
        if (!agents || agents.length === 0) return null;

        const scores = agents.map(agent => {
            let score = 0;
            const load = workload[agent.id]?.totalLoad || 0;

            // Availability
            if (agent.availability === 'Available') score += 50;

            // Experience/Skill Match (Simplistic)
            if (entity.propertyType && agent.skills?.propertyTypes?.includes(entity.propertyType)) score += 30;
            if (entity.location && agent.territories?.includes(entity.location)) score += 20;

            // Load Balancing (Penalty for high load)
            score -= Math.min(load * 2, 40);

            return { agent, score };
        });

        const best = scores.sort((a, b) => b.score - a.score)[0];
        return best ? best.agent : agents[0];
    }
}

export default new AIExpertService();
