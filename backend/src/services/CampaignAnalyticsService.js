import mongoose from 'mongoose';
import MarketingCampaign from '../../models/MarketingCampaign.js';
import CampaignRun from '../../models/CampaignRun.js';
import MarketingDelivery from '../../models/MarketingDelivery.js';
import MarketingTouch from '../../models/MarketingTouch.js';

export class CampaignAnalyticsService {
    
    /**
     * Compute full-funnel marketing metrics for a specific Campaign Run.
     * EXPLICITLY DEFERRED: Actual Cost, CPA, CPL, ROAS (requires Product Owner Cost source).
     * @param {string|mongoose.Types.ObjectId} campaignRunId 
     * @returns {Promise<Object>} Analytics payload
     */
    static async getCampaignRunAnalytics(campaignRunId) {
        const runId = new mongoose.Types.ObjectId(campaignRunId);
        
        // 1. Delivery Metrics (Distinct: ACCEPTED, SENT, DELIVERED, READ, FAILED, UNKNOWN, SUPPRESSED)
        const deliveryStats = await MarketingDelivery.aggregate([
            { $match: { campaignRunId: runId } },
            { $group: {
                _id: null,
                accepted: { $sum: { $cond: [{ $eq: ["$status", "ACCEPTED"] }, 1, 0] } },
                sent: { $sum: { $cond: [{ $eq: ["$status", "SENT"] }, 1, 0] } },
                delivered: { $sum: { $cond: [{ $eq: ["$status", "DELIVERED"] }, 1, 0] } },
                read: { $sum: { $cond: [{ $eq: ["$status", "READ"] }, 1, 0] } },
                failed: { $sum: { $cond: [{ $in: ["$status", ["FAILED_FINAL", "FAILED_RETRYABLE"]] }, 1, 0] } },
                unknown: { $sum: { $cond: [{ $eq: ["$status", "DELIVERY_UNKNOWN"] }, 1, 0] } },
                suppressed: { $sum: { $cond: [{ $eq: ["$status", "SUPPRESSED_OPTOUT"] }, 1, 0] } }
            }}
        ]);
        
        // 2. Engagement & Attribution Metrics (Leads, Deals, Revenue)
        // Grouping at the MarketingTouch level explicitly prevents Cartesian explosions.
        const touchStats = await MarketingTouch.aggregate([
            { $match: { campaignRunId: runId } },
            { $lookup: {
                from: 'leads',
                localField: '_id',
                foreignField: 'attributedTouchId',
                as: 'leads'
            }},
            { $lookup: {
                from: 'deals',
                localField: '_id',
                foreignField: 'attributedTouchId',
                as: 'deals'
            }},
            { $project: {
                isEngaged: { $cond: [{ $eq: ["$touchType", "REPLY"] }, 1, 0] },
                leadsGenerated: { $size: "$leads" },
                dealsGenerated: { $size: "$deals" },
                wonDeals: {
                    $size: {
                        $filter: {
                            input: "$deals",
                            as: "d",
                            cond: { $in: ["$$d.stage", ["Closed", "Closed Won"]] }
                        }
                    }
                },
                pipelineRevenue: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: "$deals",
                                    as: "d",
                                    cond: { $eq: ["$$d.isActiveDeal", true] }
                                }
                            },
                            as: "d",
                            in: { $ifNull: ["$$d.price", 0] }
                        }
                    }
                },
                realizedRevenue: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: "$deals",
                                    as: "d",
                                    cond: { $in: ["$$d.stage", ["Closed", "Closed Won"]] }
                                }
                            },
                            as: "d",
                            in: { $ifNull: ["$$d.closedPrice", { $ifNull: ["$$d.price", 0] }] }
                        }
                    }
                }
            }},
            { $group: {
                _id: null,
                engaged: { $sum: "$isEngaged" },
                leadsGenerated: { $sum: "$leadsGenerated" },
                dealsGenerated: { $sum: "$dealsGenerated" },
                wonDeals: { $sum: "$wonDeals" },
                pipelineRevenue: { $sum: "$pipelineRevenue" },
                realizedRevenue: { $sum: "$realizedRevenue" }
            }}
        ]);
        
        const dStats = deliveryStats[0] || { 
            accepted: 0, 
            sent: 0, 
            delivered: 0, 
            read: 0, 
            failed: 0, 
            unknown: 0, 
            suppressed: 0 
        };
        const tStats = touchStats[0] || { 
            engaged: 0, 
            leadsGenerated: 0, 
            dealsGenerated: 0, 
            wonDeals: 0, 
            pipelineRevenue: 0, 
            realizedRevenue: 0 
        };
        
        return {
            accepted: dStats.accepted || 0,
            sent: dStats.sent || 0,
            delivered: dStats.delivered || 0,
            read: dStats.read || 0,
            failed: dStats.failed || 0,
            unknown: dStats.unknown || 0,
            suppressed: dStats.suppressed || 0,
            totalOutbound: (dStats.accepted || 0) + (dStats.sent || 0) + (dStats.delivered || 0) + (dStats.read || 0),
            engaged: tStats.engaged,
            leadsGenerated: tStats.leadsGenerated,
            dealsGenerated: tStats.dealsGenerated,
            wonDeals: tStats.wonDeals,
            pipelineRevenue: tStats.pipelineRevenue,
            realizedRevenue: tStats.realizedRevenue,
            
            // FINANCIAL SCOPE FREEZE EXPLICIT ENFORCEMENT
            cost: null,
            cpl: null,
            cpa: null,
            roas: null,
            financialStatus: "DEFERRED_COST_SOURCE"
        };
    }
}
