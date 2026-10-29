import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Lookup from '../models/Lookup.js';
import Activity from '../models/Activity.js';
import Booking from '../models/Booking.js';

export const getStageDensity = async (req, res) => {
    try {
        const { timeframe } = req.query; // '30', '90', '365', 'all'
        const dateFilter = {};
        if (timeframe && timeframe !== 'all') {
            const days = parseInt(timeframe, 10);
            if (!isNaN(days)) {
                const dateLimit = new Date();
                dateLimit.setDate(dateLimit.getDate() - days);
                dateFilter.createdAt = { $gte: dateLimit };
            }
        }

        const lookups = await Lookup.find({ lookup_type: { $in: ['Stage', 'Status'] } }).lean();
        const lookupMap = {};
        lookups.forEach(l => lookupMap[l._id.toString()] = l.lookup_value);

        const leadQuery = { isLost: { $ne: true }, ...dateFilter };
        // We will fetch all active leads
        const leads = await Lead.find(leadQuery)
            .select('stage stageChangedAt createdAt status owner stageHistory')
            .populate('owner', 'fullName name')
            .lean();

        const formattedLeads = leads.map(l => {
            let stageName = l.stage;
            if (stageName && typeof stageName === 'object' && stageName.toString) stageName = lookupMap[stageName.toString()] || stageName;
            else if (stageName && lookupMap[stageName]) stageName = lookupMap[stageName];

            let statusName = l.status;
            if (statusName && typeof statusName === 'object' && statusName.toString) statusName = lookupMap[statusName.toString()] || statusName;
            else if (statusName && lookupMap[statusName]) statusName = lookupMap[statusName];

            stageName = stageName || 'Incoming';
            statusName = statusName || '';
            const agentName = l.owner?.fullName || l.owner?.name || 'Unassigned';
            
            // Fix legacy data
            let finalStage = stageName;
            if (stageName === 'Closed Won' || stageName === 'Closed Lost') {
                finalStage = 'Closed';
            }
            
            return {
                stage: finalStage,
                status: statusName,
                createdAt: l.createdAt,
                stageChangedAt: l.stageChangedAt,
                agentName,
                stageHistory: l.stageHistory || []
            };
        });

        const dealQuery = { isVisible: true, ...dateFilter };
        // Also fetch active Deals for revenue forecast
        const deals = await Deal.find(dealQuery)
            .select('stage price expectedCommission stageChangedAt createdAt assignedTo stageHistory')
            .populate('assignedTo', 'fullName name')
            .lean();
            
        const formattedDeals = deals.map(d => {
            let stageName = d.stage;
            if (stageName && typeof stageName === 'object' && stageName.toString) stageName = lookupMap[stageName.toString()] || stageName;
            else if (stageName && lookupMap[stageName]) stageName = lookupMap[stageName];
            stageName = stageName || 'Open';

            const agentName = d.assignedTo?.fullName || d.assignedTo?.name || 'Unassigned';
            return {
                stage: stageName === 'Closed Won' ? 'Closed' : stageName, // Fix legacy data
                price: d.price || 0,
                expectedCommission: d.expectedCommission || 0,
                createdAt: d.createdAt,
                stageChangedAt: d.stageChangedAt,
                agentName,
                stageHistory: d.stageHistory || []
            };
        });

        res.json({
            success: true,
            data: {
                leads: formattedLeads,
                deals: formattedDeals
            }
        });
    } catch (error) {
        console.error('[Analytics] Stage Density fetch error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching density data' });
    }
};

export const getSiteVisitFunnelAnalytics = async (req, res) => {
    try {
        const { timeframe = '30', startDate, endDate, projectId, agentId } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (timeframe && timeframe !== 'all') {
            const days = parseInt(timeframe, 10);
            if (!isNaN(days)) {
                const dateLimit = new Date();
                dateLimit.setDate(dateLimit.getDate() - days);
                dateFilter.createdAt = { $gte: dateLimit };
            }
        }

        const visitMatch = {
            type: 'Site Visit',
            ...dateFilter
        };

        if (agentId && mongoose.Types.ObjectId.isValid(agentId)) {
            visitMatch.assignedTo = new mongoose.Types.ObjectId(agentId);
        }
        if (projectId) {
            visitMatch['details.projectName'] = projectId;
        }

        const ActivityModel = mongoose.models.Activity || Activity;
        const DealModel = mongoose.models.Deal || Deal;
        const BookingModel = mongoose.models.Booking || Booking;

        // Aggregation for funnel stats
        const visits = await ActivityModel.find(visitMatch).lean();

        const totalScheduled = visits.length;
        const completedVisits = visits.filter(v => v.status === 'Completed');
        const totalCompleted = completedVisits.length;
        const cancelledVisits = visits.filter(v => v.status === 'Cancelled').length;
        const pendingVisits = visits.filter(v => v.status === 'Scheduled' || v.status === 'Pending').length;

        // Feedback stats
        let feedbackReceived = 0;
        let ratingSum = 0;
        let highSatisfactionCount = 0;
        let escalationCount = 0;

        completedVisits.forEach(v => {
            const fb = v.details?.customerFeedback;
            if (fb && typeof fb.rating === 'number' && fb.rating > 0) {
                feedbackReceived++;
                ratingSum += fb.rating;
                if (fb.rating >= 4) highSatisfactionCount++;
                if (fb.rating <= 2) escalationCount++;
            } else if (v.tags?.includes('High-Satisfaction')) {
                feedbackReceived++;
                ratingSum += 5;
                highSatisfactionCount++;
            } else if (v.tags?.includes('Escalation-Negative-Feedback')) {
                feedbackReceived++;
                ratingSum += 2;
                escalationCount++;
            }
        });

        const averageRating = feedbackReceived > 0 ? parseFloat((ratingSum / feedbackReceived).toFixed(2)) : 0;
        const completionRate = totalScheduled > 0 ? parseFloat(((totalCompleted / totalScheduled) * 100).toFixed(1)) : 0;
        const feedbackRate = totalCompleted > 0 ? parseFloat(((feedbackReceived / totalCompleted) * 100).toFixed(1)) : 0;

        // Deals & Revenue Attribution
        const completedVisitIds = completedVisits.map(v => v._id);
        const linkedDeals = await DealModel.find({
            $or: [
                { siteVisitId: { $in: completedVisitIds } },
                { _id: { $in: completedVisits.map(v => v.details?.linkedDealId).filter(Boolean) } }
            ]
        }).lean();

        const dealsCreated = linkedDeals.length;
        const wonStages = ['Closed', 'Closed Won', 'Booked'];
        const wonDeals = linkedDeals.filter(d => wonStages.includes(d.stage));
        const dealsWon = wonDeals.length;
        const conversionRate = totalCompleted > 0 ? parseFloat(((dealsWon / totalCompleted) * 100).toFixed(1)) : 0;
        const totalDealValue = wonDeals.reduce((sum, d) => sum + (d.price || d.quotePrice || 0), 0);

        // Bookings directly attributed
        const linkedBookings = await BookingModel.find({
            $or: [
                { siteVisitId: { $in: completedVisitIds } },
                { dealId: { $in: linkedDeals.map(d => d._id) } }
            ]
        }).lean();

        const totalBookings = linkedBookings.length;
        const totalRevenue = linkedBookings.reduce((sum, b) => sum + (b.totalDealAmount || 0), 0);
        const totalCommission = linkedBookings.reduce((sum, b) => sum + (b.commissionReceived || b.totalCommissionAmount || 0), 0);

        // Project breakdown
        const projectMap = {};
        completedVisits.forEach(v => {
            const pName = v.details?.projectName || 'General / Other';
            if (!projectMap[pName]) {
                projectMap[pName] = { projectName: pName, visits: 0, dealsWon: 0, revenue: 0 };
            }
            projectMap[pName].visits++;
        });

        wonDeals.forEach(d => {
            const pName = d.projectName || 'General / Other';
            if (!projectMap[pName]) {
                projectMap[pName] = { projectName: pName, visits: 0, dealsWon: 0, revenue: 0 };
            }
            projectMap[pName].dealsWon++;
            projectMap[pName].revenue += (d.price || 0);
        });

        res.json({
            success: true,
            data: {
                summary: {
                    totalScheduled,
                    totalCompleted,
                    pendingVisits,
                    cancelledVisits,
                    completionRate,
                    feedbackReceived,
                    feedbackRate,
                    averageRating,
                    highSatisfactionCount,
                    escalationCount,
                    dealsCreated,
                    dealsWon,
                    conversionRate,
                    totalBookings,
                    totalDealValue,
                    totalRevenue,
                    totalCommission
                },
                projectBreakdown: Object.values(projectMap)
            }
        });
    } catch (error) {
        console.error('[SiteVisitFunnelAnalytics] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCampaignAttributionAnalytics = async (req, res) => {
    try {
        const { timeframe = '30', startDate, endDate } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (timeframe && timeframe !== 'all') {
            const days = parseInt(timeframe, 10);
            if (!isNaN(days)) {
                const dateLimit = new Date();
                dateLimit.setDate(dateLimit.getDate() - days);
                dateFilter.createdAt = { $gte: dateLimit };
            }
        }

        const LeadModel = mongoose.models.Lead || Lead;
        const ActivityModel = mongoose.models.Activity || Activity;
        const DealModel = mongoose.models.Deal || Deal;
        const BookingModel = mongoose.models.Booking || Booking;

        // Fetch leads in date range
        const leads = await LeadModel.find(dateFilter).select('_id source campaign source_meta createdAt stage isWon').lean();

        // Fetch site visits in date range
        const visits = await ActivityModel.find({ type: 'Site Visit', ...dateFilter }).select('_id entityId entityType status details').lean();

        // Fetch deals in date range
        const deals = await DealModel.find(dateFilter).select('_id leadId siteVisitId stage price marketingAttribution source').lean();

        // Fetch bookings in date range
        const bookings = await BookingModel.find(dateFilter).select('_id lead dealId siteVisitId totalDealAmount commissionReceived marketingAttribution').lean();

        const campaignMap = {};

        const getCampaignName = (meta, campaignField, sourceField) => {
            if (meta?.utm_campaign) return meta.utm_campaign;
            if (typeof campaignField === 'string' && campaignField) return campaignField;
            if (campaignField?.name) return campaignField.name;
            if (typeof sourceField === 'string' && sourceField) return sourceField;
            if (sourceField?.name) return sourceField.name;
            return 'Direct / Organic';
        };

        // Aggregate Leads
        leads.forEach(l => {
            const campName = getCampaignName(l.source_meta, l.campaign, l.source);
            if (!campaignMap[campName]) {
                campaignMap[campName] = {
                    campaign: campName,
                    source: l.source_meta?.utm_source || l.source || 'Direct',
                    leadsCount: 0,
                    siteVisitsScheduled: 0,
                    siteVisitsCompleted: 0,
                    dealsCreated: 0,
                    dealsWon: 0,
                    totalDealValue: 0,
                    bookingsCount: 0,
                    totalRevenue: 0
                };
            }
            campaignMap[campName].leadsCount++;
        });

        // Map Lead ID to Campaign Name
        const leadIdToCamp = {};
        leads.forEach(l => {
            leadIdToCamp[String(l._id)] = getCampaignName(l.source_meta, l.campaign, l.source);
        });

        // Aggregate Site Visits
        visits.forEach(v => {
            const leadIdStr = String(v.entityId);
            const campName = leadIdToCamp[leadIdStr] || 'Direct / Organic';
            if (!campaignMap[campName]) {
                campaignMap[campName] = {
                    campaign: campName,
                    source: 'Direct',
                    leadsCount: 0,
                    siteVisitsScheduled: 0,
                    siteVisitsCompleted: 0,
                    dealsCreated: 0,
                    dealsWon: 0,
                    totalDealValue: 0,
                    bookingsCount: 0,
                    totalRevenue: 0
                };
            }
            campaignMap[campName].siteVisitsScheduled++;
            if (v.status === 'Completed') {
                campaignMap[campName].siteVisitsCompleted++;
            }
        });

        // Aggregate Deals
        const wonStages = ['Closed', 'Closed Won', 'Booked'];
        deals.forEach(d => {
            let campName = d.marketingAttribution?.campaign || leadIdToCamp[String(d.leadId)] || 'Direct / Organic';
            if (!campaignMap[campName]) {
                campaignMap[campName] = {
                    campaign: campName,
                    source: d.marketingAttribution?.source || 'Direct',
                    leadsCount: 0,
                    siteVisitsScheduled: 0,
                    siteVisitsCompleted: 0,
                    dealsCreated: 0,
                    dealsWon: 0,
                    totalDealValue: 0,
                    bookingsCount: 0,
                    totalRevenue: 0
                };
            }
            campaignMap[campName].dealsCreated++;
            if (wonStages.includes(d.stage)) {
                campaignMap[campName].dealsWon++;
                campaignMap[campName].totalDealValue += (d.price || 0);
            }
        });

        // Aggregate Bookings
        bookings.forEach(b => {
            let campName = b.marketingAttribution?.campaign || leadIdToCamp[String(b.lead)] || 'Direct / Organic';
            if (!campaignMap[campName]) {
                campaignMap[campName] = {
                    campaign: campName,
                    source: b.marketingAttribution?.source || 'Direct',
                    leadsCount: 0,
                    siteVisitsScheduled: 0,
                    siteVisitsCompleted: 0,
                    dealsCreated: 0,
                    dealsWon: 0,
                    totalDealValue: 0,
                    bookingsCount: 0,
                    totalRevenue: 0
                };
            }
            campaignMap[campName].bookingsCount++;
            campaignMap[campName].totalRevenue += (b.totalDealAmount || 0);
        });

        const campaigns = Object.values(campaignMap).map(c => {
            const conversionRate = c.leadsCount > 0 ? parseFloat(((c.dealsWon / c.leadsCount) * 100).toFixed(1)) : 0;
            return {
                ...c,
                conversionRate
            };
        });

        res.json({
            success: true,
            data: {
                totalCampaigns: campaigns.length,
                campaigns
            }
        });
    } catch (error) {
        console.error('[CampaignAttributionAnalytics] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
