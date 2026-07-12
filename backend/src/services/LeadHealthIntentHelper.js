export const computeIntentScore = (lead, activities, config) => {
    if (!config) return 0;
    let score = 0;

    // 1. Repeat Site Visit
    if (config.visitRepeat?.isActive) {
        const visitCount = activities.filter(a => (a.type || '').toLowerCase() === 'site visit').length;
        if (visitCount > 1) {
            score += Number(config.visitRepeat.weight || 0);
        }
    }

    // 2. Offer Revisions Count
    if (config.offerRevisions?.isActive) {
        const offerCount = activities.filter(a => {
            const name = (a.type || '').toLowerCase();
            const purp = (a.subject || '').toLowerCase();
            return name.includes('offer') || purp.includes('offer') || name.includes('quotation');
        }).length;
        if (offerCount > 1) {
            score += Number(config.offerRevisions.weight || 0) * (offerCount - 1);
        }
    }

    // 3. Legal Doc Requested
    if (config.legalDocRequest?.isActive) {
        const hasLegal = activities.some(a => {
            const text = `${a.type} ${a.subject} ${a.completionResult} ${JSON.stringify(a.details || {})}`.toLowerCase();
            return text.includes('legal') || text.includes('contract') || text.includes('agreement');
        });
        if (hasLegal) {
            score += Number(config.legalDocRequest.weight || 0);
        }
    }

    // 4. Family Brought for Visit
    if (config.familyVisit?.isActive) {
        const hasFamily = activities.some(a => {
            return (a.type || '').toLowerCase() === 'site visit' && a.details?.withFamily === true;
        });
        if (hasFamily) {
            score += Number(config.familyVisit.weight || 0);
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
