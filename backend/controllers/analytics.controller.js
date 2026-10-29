import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Lookup from '../models/Lookup.js';
import Activity from '../models/Activity.js';
import Booking from '../models/Booking.js';
import { getVisibilityFilter } from '../utils/visibility.js';

/**
 * Validates query parameters against object/array injection and operator injection.
 * Rejects any parameter whose value is an object or array, or whose key starts with '$' or contains '.'.
 */
const validateScalarQueryParams = (query) => {
    if (!query || typeof query !== 'object') return { valid: true };
    for (const key of Object.keys(query)) {
        if (key.startsWith('$') || key.includes('.')) {
            return { valid: false, message: `Invalid query parameter name: "${key}"` };
        }
        const val = query[key];
        if (val !== null && typeof val === 'object') {
            return { valid: false, message: `Invalid query parameter: "${key}" must be a scalar value, not an object or array` };
        }
    }
    return { valid: true };
};

/**
 * Validates and normalizes timeframe and date range query parameters.
 */
const parseDateRange = (query) => {
    const { startDate, endDate, timeframe } = query;

    // Both startDate and endDate must be provided if either is present
    if (startDate !== undefined || endDate !== undefined) {
        if (startDate === undefined || endDate === undefined) {
            return { error: 'Both startDate and endDate must be provided together' };
        }
        if (typeof startDate !== 'string' || typeof endDate !== 'string') {
            return { error: 'startDate and endDate must be strings' };
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { error: 'Invalid startDate or endDate: must be valid ISO date strings' };
        }
        if (start > end) {
            return { error: 'startDate cannot be after endDate' };
        }
        return { dateFilter: { createdAt: { $gte: start, $lte: end } } };
    }

    // If timeframe is provided
    if (timeframe !== undefined) {
        if (typeof timeframe !== 'string' && typeof timeframe !== 'number') {
            return { error: 'timeframe must be a scalar value' };
        }
        const tfStr = String(timeframe).trim();
        if (tfStr === 'all') {
            return { dateFilter: {} };
        }
        if (!/^\d+$/.test(tfStr)) {
            return { error: 'Invalid timeframe: must be a positive integer or "all"' };
        }
        const days = parseInt(tfStr, 10);
        if (days <= 0 || days > 3650) {
            return { error: 'Invalid timeframe: must be between 1 and 3650 days' };
        }
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - days);
        return { dateFilter: { createdAt: { $gte: dateLimit } } };
    }

    // Default 30 days
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - 30);
    return { dateFilter: { createdAt: { $gte: dateLimit } } };
};

export const getStageDensity = async (req, res) => {
    try {
        const paramCheck = validateScalarQueryParams(req.query);
        if (!paramCheck.valid) {
            return res.status(400).json({ success: false, message: paramCheck.message });
        }

        const dateResult = parseDateRange(req.query);
        if (dateResult.error) {
            return res.status(400).json({ success: false, message: dateResult.error });
        }
        const dateFilter = dateResult.dateFilter;

        let visibilityFilter = {};
        if (req.user) {
            try {
                visibilityFilter = await getVisibilityFilter(req.user);
            } catch (err) {
                console.error('[Analytics] getVisibilityFilter failure in getStageDensity:', err);
                return res.status(403).json({ success: false, message: 'Access denied: visibility resolution failed' });
            }
        }

        const lookups = await Lookup.find({ lookup_type: { $in: ['Stage', 'Status'] } }).lean();
        const lookupMap = {};
        lookups.forEach(l => lookupMap[l._id.toString()] = l.lookup_value);

        const leadMatch = Object.keys(visibilityFilter).length > 0
            ? { isLost: { $ne: true }, ...dateFilter, $and: [visibilityFilter] }
            : { isLost: { $ne: true }, ...dateFilter };

        // We will fetch all active leads
        const leads = await Lead.find(leadMatch)
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

        const dealMatch = Object.keys(visibilityFilter).length > 0
            ? { isVisible: true, ...dateFilter, $and: [visibilityFilter] }
            : { isVisible: true, ...dateFilter };

        // Also fetch active Deals for revenue forecast
        const deals = await Deal.find(dealMatch)
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
        const paramCheck = validateScalarQueryParams(req.query);
        if (!paramCheck.valid) {
            return res.status(400).json({ success: false, message: paramCheck.message });
        }

        const dateResult = parseDateRange(req.query);
        if (dateResult.error) {
            return res.status(400).json({ success: false, message: dateResult.error });
        }
        const dateFilter = dateResult.dateFilter;

        const { projectId, agentId } = req.query;

        const visitMatch = {
            type: 'Site Visit',
            ...dateFilter
        };

        if (agentId !== undefined) {
            if (typeof agentId !== 'string') {
                return res.status(400).json({ success: false, message: 'Invalid agentId: must be a scalar string' });
            }
            const trimmedAgentId = agentId.trim();
            if (!/^[0-9a-fA-F]{24}$/.test(trimmedAgentId) || !mongoose.Types.ObjectId.isValid(trimmedAgentId)) {
                return res.status(400).json({ success: false, message: 'Invalid agentId: must be a valid 24-character hexadecimal ObjectId' });
            }
            visitMatch.assignedTo = new mongoose.Types.ObjectId(trimmedAgentId);
        }

        if (projectId !== undefined) {
            if (typeof projectId !== 'string') {
                return res.status(400).json({ success: false, message: 'Invalid projectId: must be a scalar string' });
            }
            const trimmedProject = projectId.trim();
            if (trimmedProject.length === 0 || trimmedProject.startsWith('$')) {
                return res.status(400).json({ success: false, message: 'Invalid projectId parameter' });
            }
            visitMatch['details.projectName'] = trimmedProject;
        }

        let visibilityFilter = {};
        if (req.user) {
            try {
                visibilityFilter = await getVisibilityFilter(req.user);
            } catch (err) {
                console.error('[Analytics] getVisibilityFilter failure in getSiteVisitFunnelAnalytics:', err);
                return res.status(403).json({ success: false, message: 'Access denied: visibility resolution failed' });
            }
        }

        const finalVisitMatch = Object.keys(visibilityFilter).length > 0
            ? { ...visitMatch, $and: [visibilityFilter] }
            : visitMatch;

        const ActivityModel = mongoose.models.Activity || Activity;
        const DealModel = mongoose.models.Deal || Deal;
        const BookingModel = mongoose.models.Booking || Booking;

        // Aggregation for funnel stats
        const visits = await ActivityModel.find(finalVisitMatch).lean();

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
        const linkedDealIds = completedVisits.map(v => v.details?.linkedDealId).filter(Boolean);

        let linkedDeals = [];
        if (completedVisitIds.length > 0 || linkedDealIds.length > 0) {
            const dealOrClauses = [];
            if (completedVisitIds.length > 0) dealOrClauses.push({ siteVisitId: { $in: completedVisitIds } });
            if (linkedDealIds.length > 0) dealOrClauses.push({ _id: { $in: linkedDealIds } });

            const dealMatch = { $or: dealOrClauses };
            const finalDealMatch = Object.keys(visibilityFilter).length > 0
                ? { ...dealMatch, $and: [visibilityFilter] }
                : dealMatch;

            linkedDeals = await DealModel.find(finalDealMatch).lean();
        }

        const dealsCreated = linkedDeals.length;
        const wonStages = ['Closed', 'Closed Won', 'Booked'];
        const wonDeals = linkedDeals.filter(d => wonStages.includes(d.stage));
        const dealsWon = wonDeals.length;
        const conversionRate = totalCompleted > 0 ? parseFloat(((dealsWon / totalCompleted) * 100).toFixed(1)) : 0;
        const totalDealValue = wonDeals.reduce((sum, d) => sum + (d.price || d.quotePrice || 0), 0);

        // Bookings directly attributed
        let linkedBookings = [];
        const dealIds = linkedDeals.map(d => d._id);
        if (completedVisitIds.length > 0 || dealIds.length > 0) {
            const bookingOrClauses = [];
            if (completedVisitIds.length > 0) bookingOrClauses.push({ siteVisitId: { $in: completedVisitIds } });
            if (dealIds.length > 0) bookingOrClauses.push({ dealId: { $in: dealIds } });

            const bookingMatch = { $or: bookingOrClauses };
            const finalBookingMatch = Object.keys(visibilityFilter).length > 0
                ? { ...bookingMatch, $and: [visibilityFilter] }
                : bookingMatch;

            linkedBookings = await BookingModel.find(finalBookingMatch).lean();
        }

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
        const paramCheck = validateScalarQueryParams(req.query);
        if (!paramCheck.valid) {
            return res.status(400).json({ success: false, message: paramCheck.message });
        }

        const dateResult = parseDateRange(req.query);
        if (dateResult.error) {
            return res.status(400).json({ success: false, message: dateResult.error });
        }
        const dateFilter = dateResult.dateFilter;

        let visibilityFilter = {};
        if (req.user) {
            try {
                visibilityFilter = await getVisibilityFilter(req.user);
            } catch (err) {
                console.error('[Analytics] getVisibilityFilter failure in getCampaignAttributionAnalytics:', err);
                return res.status(403).json({ success: false, message: 'Access denied: visibility resolution failed' });
            }
        }

        const LeadModel = mongoose.models.Lead || Lead;
        const ActivityModel = mongoose.models.Activity || Activity;
        const DealModel = mongoose.models.Deal || Deal;
        const BookingModel = mongoose.models.Booking || Booking;

        const leadMatch = Object.keys(visibilityFilter).length > 0
            ? { ...dateFilter, $and: [visibilityFilter] }
            : { ...dateFilter };

        const visitMatch = Object.keys(visibilityFilter).length > 0
            ? { type: 'Site Visit', ...dateFilter, $and: [visibilityFilter] }
            : { type: 'Site Visit', ...dateFilter };

        const dealMatch = Object.keys(visibilityFilter).length > 0
            ? { ...dateFilter, $and: [visibilityFilter] }
            : { ...dateFilter };

        const bookingMatch = Object.keys(visibilityFilter).length > 0
            ? { ...dateFilter, $and: [visibilityFilter] }
            : { ...dateFilter };

        // Fetch leads in date range
        const leads = await LeadModel.find(leadMatch).select('_id source campaign source_meta createdAt stage isWon').lean();

        // Fetch site visits in date range
        const visits = await ActivityModel.find(visitMatch).select('_id entityId entityType status details').lean();

        // Fetch deals in date range
        const deals = await DealModel.find(dealMatch).select('_id leadId siteVisitId stage price marketingAttribution source').lean();

        // Fetch bookings in date range
        const bookings = await BookingModel.find(bookingMatch).select('_id lead dealId siteVisitId totalDealAmount commissionReceived marketingAttribution').lean();

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
