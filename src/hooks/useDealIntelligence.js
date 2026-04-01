import { useMemo } from 'react';
import { STAGE_PIPELINE, getStageProbability } from '../utils/stageEngine';
import { 
    computeAging, 
    computeDealDeath, 
    detectCommissionLeakage, 
    computeDealHealth, 
    computeOwnerResponseRate, 
    DEFAULT_FORECAST_CONFIG, 
    DEFAULT_HEALTH_CONFIG 
} from '../utils/agingEngine';

export const useDealIntelligence = (deal, currentStage) => {
    return useMemo(() => {
        if (!deal) return { dealDeath: null, leakage: null, stageInfo: null, health: null, aging: null, ownerResponseRate: null };

        // Aging
        const aging = computeAging(
            deal.createdAt || Date.now(),
            deal.stageChangedAt || deal.createdAt,
            deal.lastActivityAt
        );

        // Deal Death Detection
        const lastOfferDate = deal.negotiationRounds?.length > 0
            ? deal.negotiationRounds[deal.negotiationRounds.length - 1].date
            : null;
        const dealDeath = computeDealDeath(currentStage, aging.stageDays, lastOfferDate, aging.activityGapDays);

        // Commission leakage
        const commissionRate = DEFAULT_FORECAST_CONFIG.commissionRate.value;
        const commission = (deal.price || 0) * (commissionRate / 100);
        const leakageThreshold = DEFAULT_FORECAST_CONFIG.commissionLeakageThreshold.value;
        const stageHealth = getStageProbability(currentStage);
        const leakage = detectCommissionLeakage(stageHealth, commission, leakageThreshold);

        // Deal Health Score v3
        const ownerResponseRate = computeOwnerResponseRate(aging.activityGapDays);
        const dealActivities = Array.isArray(deal.activities) ? deal.activities : [];
        const leadScore = deal.leadScore || stageHealth;
        
        const health = computeDealHealth(
            leadScore,
            currentStage,
            [], // riskFlags
            DEFAULT_HEALTH_CONFIG,
            ownerResponseRate,
            dealActivities
        );

        // STAGE_PIPELINE info
        const STAGE_MAP = {
            'Open': 'New', 'Quote': 'Opportunity', 'Negotiation': 'Negotiation',
            'Booked': 'Booked', 'Closed': 'Closed Won', 'Closed Won': 'Closed Won',
            'Closed Lost': 'Closed Lost', 'Stalled': 'Stalled'
        };
        const mapped = STAGE_MAP[currentStage] || currentStage;
        const stageInfo = STAGE_PIPELINE.find(s => s.label === mapped) || STAGE_PIPELINE[0];

        return { dealDeath, leakage, stageInfo, aging, health, ownerResponseRate };
    }, [deal, currentStage]);
};
