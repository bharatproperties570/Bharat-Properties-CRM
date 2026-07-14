import { useMemo } from 'react';
import { STAGE_PIPELINE, getStageProbability } from '../utils/stageEngine';
import { 
    computeAging, 
    computeDealDeath, 
    detectCommissionLeakage, 
    computeDealHealth, 
    computeOwnerResponseRate, 
    computeRiskFlags,
    DEFAULT_FORECAST_CONFIG, 
    DEFAULT_HEALTH_CONFIG,
    DEFAULT_AGING_RULES
} from '../utils/agingEngine';
import { usePropertyConfig } from '../context/PropertyConfigContext';

export const useDealIntelligence = (deal, currentStage) => {
    // Consume live configs from context
    const { agingRules, forecastConfig, dealHealthConfig } = usePropertyConfig() || {};

    const liveAgingRules = agingRules || DEFAULT_AGING_RULES;
    const liveForecastConfig = forecastConfig || DEFAULT_FORECAST_CONFIG;
    const liveHealthConfig = dealHealthConfig || DEFAULT_HEALTH_CONFIG;

    return useMemo(() => {
        if (!deal) return { dealDeath: null, leakage: null, stageInfo: null, health: null, aging: null, ownerResponseRate: null, riskFlags: [] };

        // Aging
        const aging = computeAging(
            deal.createdAt || Date.now(),
            deal.stageChangedAt || deal.createdAt,
            deal.lastActivityAt
        );

        // Risk Flags
        const riskFlags = computeRiskFlags(currentStage, aging, liveAgingRules);

        // Extract Real Estate specifics
        let funding = 'Unknown';
        if (deal.leadId?.funding) {
            funding = deal.leadId.funding;
        } else if (deal.leads && deal.leads.length > 0 && deal.leads[0]?.funding) {
            funding = deal.leads[0].funding;
        }

        const inventoryStatus = deal.inventoryId?.status || 'Available';
        const dealValue = deal.price || 0;

        // Deal Death Detection
        const lastOfferDate = deal.negotiationRounds?.length > 0
            ? deal.negotiationRounds[deal.negotiationRounds.length - 1].date
            : null;
        const dealDeath = computeDealDeath(currentStage, aging.stageDays, lastOfferDate, aging.activityGapDays, liveAgingRules, dealValue);

        // Commission leakage
        const commissionRate = liveForecastConfig.commissionRate?.value ?? DEFAULT_FORECAST_CONFIG.commissionRate.value;
        const commission = (deal.price || 0) * (commissionRate / 100);
        const leakageThreshold = liveForecastConfig.commissionLeakageThreshold?.value ?? DEFAULT_FORECAST_CONFIG.commissionLeakageThreshold.value;
        const stageHealth = getStageProbability(currentStage);
        const leakage = detectCommissionLeakage(stageHealth, commission, leakageThreshold);

        // Deal Health Score v3
        const ownerResponseRate = computeOwnerResponseRate(aging.activityGapDays);
        const dealActivities = Array.isArray(deal.activities) ? deal.activities : [];
        const leadScore = deal.leadScore || stageHealth;
        
        const health = computeDealHealth(
            leadScore,
            currentStage,
            riskFlags,
            liveHealthConfig,
            ownerResponseRate,
            dealActivities,
            {}, // activityMasterFields
            funding,
            inventoryStatus
        );

        // STAGE_PIPELINE info
        const STAGE_MAP = {
            'Open': 'New', 'Quote': 'Opportunity', 'Negotiation': 'Negotiation',
            'Booked': 'Booked', 'Closed': 'Closed (Won)', 'Closed Won': 'Closed (Won)',
            'Closed Lost': 'Closed (Lost)', 'Stalled': 'Stalled'
        };
        const mapped = STAGE_MAP[currentStage] || currentStage;
        const stageInfo = STAGE_PIPELINE.find(s => s.label === mapped) || STAGE_PIPELINE[0];

        return { dealDeath, leakage, stageInfo, aging, health, ownerResponseRate, riskFlags };
    }, [deal, currentStage, liveAgingRules, liveForecastConfig, liveHealthConfig]);
};
