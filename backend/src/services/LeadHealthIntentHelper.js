export const computeIntentScore = (lead, activities, config) => {
    if (!config) return 0;
    let score = 0;
    const now = Date.now();

    // Helper: Time Decay Factor (0 to 1)
    // Activities within 7 days = 1.0 weight
    // Activities up to 30 days scale down to 0 weight
    const getDecayFactor = (dateStr) => {
        if (!dateStr) return 0;
        const daysOld = (now - new Date(dateStr).getTime()) / 86400000;
        if (daysOld <= 7) return 1;
        if (daysOld >= 30) return 0;
        return 1 - ((daysOld - 7) / 23); // Linear decay between day 7 and 30
    };

    // Helper: Structured Activity Match
    const isActivityType = (a, typeOrKeywords) => {
        // Assume 'a' could have a populated Lookup type or a string
        const typeName = (typeof a.type === 'object' && a.type ? a.type.lookup_value || a.type.name || a.type.label : a.type || '').toLowerCase();
        const subject = (a.subject || '').toLowerCase();
        
        if (Array.isArray(typeOrKeywords)) {
            return typeOrKeywords.some(k => typeName.includes(k) || subject.includes(k));
        }
        return typeName.includes(typeOrKeywords) || subject.includes(typeOrKeywords);
    };

    // 1. Repeat Site Visit
    if (config.visitRepeat?.isActive) {
        const visits = activities.filter(a => isActivityType(a, ['site visit', 'property visit', 'inspection']));
        if (visits.length > 1) {
            // Apply decay based on the most recent visit
            const latestVisit = visits.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            score += Number(config.visitRepeat.weight || 0) * getDecayFactor(latestVisit.date);
        }
    }

    // 2. Offer Revisions Count
    if (config.offerRevisions?.isActive) {
        const offers = activities.filter(a => isActivityType(a, ['offer', 'quotation', 'proposal']));
        if (offers.length > 1) {
            const latestOffer = offers.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            score += (Number(config.offerRevisions.weight || 0) * (offers.length - 1)) * getDecayFactor(latestOffer.date);
        }
    }

    // 3. Legal Doc / Financial Readiness
    if (config.legalDocRequest?.isActive) {
        const legalActs = activities.filter(a => {
            const text = `${a.type} ${a.subject} ${a.completionResult} ${JSON.stringify(a.details || {})}`.toLowerCase();
            return text.includes('legal') || text.includes('contract') || text.includes('agreement') || text.includes('mortgage') || text.includes('loan') || text.includes('pre-approved');
        });
        if (legalActs.length > 0) {
            const latestLegal = legalActs.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            score += Number(config.legalDocRequest.weight || 0) * getDecayFactor(latestLegal.date);
        }
    }

    // 4. Family Brought for Visit
    if (config.familyVisit?.isActive) {
        const familyVisits = activities.filter(a => isActivityType(a, ['site visit', 'property visit']) && a.details?.withFamily === true);
        if (familyVisits.length > 0) {
            const latestFam = familyVisits.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            score += Number(config.familyVisit.weight || 0) * getDecayFactor(latestFam.date);
        }
    }

    // 5. Budget Gap % (Enterprise Feature)
    if (config.budgetGapPct?.isActive && lead.budget_max && lead.deals && lead.deals.length > 0) {
        const dealValues = lead.deals.map(d => d.price || d.expectedValue || 0).filter(v => v > 0);
        if (dealValues.length > 0) {
            const maxDealVal = Math.max(...dealValues);
            const budgetGap = ((maxDealVal - lead.budget_max) / lead.budget_max) * 100;
            // If property is more than 15% above max budget, penalize intent
            if (budgetGap > 15) {
                score += Number(config.budgetGapPct.weight || -10); // Note: weight should be negative
            }
        }
    }

    // 6. WhatsApp Response Rate (Enterprise Feature)
    if (config.whatsappResponse?.isActive) {
        const waActivities = activities.filter(a => isActivityType(a, 'whatsapp'));
        const inbound = waActivities.filter(a => a.direction === 'inbound').length;
        const outbound = waActivities.filter(a => a.direction === 'outbound').length;
        
        if (outbound > 3) {
            const responseRate = inbound / outbound;
            // If they replied to less than 20% of our messages, apply penalty (ghosting)
            if (responseRate < 0.2) {
                // Subtract the positive weight from the score (acting as a penalty)
                score -= Number(config.whatsappResponse.weight || 5) * 2;
            } else if (responseRate > 0.6) {
                // Strong responsiveness
                score += Number(config.whatsappResponse.weight || 5);
            }
        }
    }

    return score;
};

export const computeDealHealth = (lead, totalScore, config) => {
    if (!config) return { score: 50, status: 'Unknown' };
    
    const stageVal = (typeof lead.stage === 'object' && lead.stage ? (lead.stage.lookup_value || lead.stage.label || lead.stage.name || '') : (lead.stage || '')).toLowerCase();
    let probability = 10;
    if (stageVal.includes('prospect')) probability = 20;
    else if (stageVal.includes('opportunity')) probability = 40;
    else if (stageVal.includes('negotiation') || stageVal.includes('book')) probability = 65;
    else if (stageVal.includes('won') || stageVal.includes('closed')) probability = 100;
    
    const stageComponent = (probability / 100) * (config.stageWeight?.weight || 40);
    const normalizedScore = Math.min(100, Math.max(0, totalScore)) / 100;
    const scoreComponent = normalizedScore * (config.scoreWeight?.weight || 35);
    
    const lastDate = new Date(lead.stageChangedAt || lead.createdAt || new Date());
    const daysInStage = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const penaltyScale = Math.min(1, daysInStage / 30);
    const agePenaltyComponent = penaltyScale * (config.agePenalty?.weight || 15);
    
    const riskPenaltyComponent = (lead.decay_score > 0 ? 1 : 0) * (config.riskPenalty?.weight || 10);
    
    let healthScore = Math.round(stageComponent + scoreComponent - agePenaltyComponent - riskPenaltyComponent);
    healthScore = Math.max(0, Math.min(100, healthScore)); 
    
    let status = 'Unknown';
    if (healthScore >= (config.thresholds?.green?.min || 70)) status = 'Healthy';
    else if (healthScore >= (config.thresholds?.yellow?.min || 40)) status = 'Watch';
    else status = 'At Risk';
    
    return { score: healthScore, status };
};
