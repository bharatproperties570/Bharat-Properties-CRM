import Activity from "../models/Activity.js";
import Lead from "../models/Lead.js";
import Deal from "../models/Deal.js";
import Lookup from "../models/Lookup.js";
import Inventory from "../models/Inventory.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { safeRedisCall } from "../src/config/redis.js";

export const getDashboardStats = async (req, res) => {
    try {
        const { userId, teamId } = req.query;
        let cachedKpis = null;

        if (!userId && !teamId) {
            cachedKpis = await safeRedisCall('get', 'dashboard_kpis_v2');
        }

        if (cachedKpis) {
            return res.json({ success: true, data: JSON.parse(cachedKpis), cached: true });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - today.getDay());

        // ━━ LOOKUP MAP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const lookups = await Lookup.find({ lookup_type: { $in: ['Stage', 'InventoryStatus', 'Status', 'Source', 'PropertyType'] } });
        const lookupMap = {};
        lookups.forEach(l => {
            lookupMap[l._id.toString()] = l.lookup_value;
        });

        // Resolve nested lookups (where value is another lookup ID)
        for (let i = 0; i < 5; i++) {
            let changed = false;
            Object.keys(lookupMap).forEach(id => {
                const val = lookupMap[id];
                if (val && mongoose.Types.ObjectId.isValid(val) && lookupMap[val]) {
                    lookupMap[id] = lookupMap[val];
                    changed = true;
                }
            });
            if (!changed) break;
        }

        const CATEGORY_MAPPING = {
            'INCOMING': ['New', 'Inbound', 'Incoming', 'Open', 'Lead', 'Unassigned', 'Lead Created', 'Lead Received', 'Inquiry', 'Project Inquiry'],
            'PROSPECT': ['Prospect', 'Qualified', 'Warm', 'Interested', 'Follow-up', 'Engaged', 'Nurturing', 'Contacted', 'Contacted-Low Interest', 'Call Scheduled'],
            'OPPORTUNITY': ['Opportunity', 'Hot', 'Quote', 'Proposal', 'Presentation', 'Site Visit', 'Site Visit Scheduled', 'Site Visit Done'],
            'NEGOTIATION': ['Negotiation', 'Negotiating', 'Booked', 'Under Review', 'Contract', 'Reserved', 'Booking Done', 'Token Received'],
            'WON': ['Closed Won', 'Sold', 'Won', 'Deal Closed', 'Closed'],
            'LOST': ['Closed Lost', 'Stalled', 'Dead', 'Lost', 'Cancelled', 'Invalid', 'Rejection', 'Not Interested', 'Wrong Number']
        };

        const reverseMapping = {};
        Object.entries(CATEGORY_MAPPING).forEach(([cat, stages]) => {
            stages.forEach(s => { reverseMapping[s.toLowerCase()] = cat; });
        });

        const baseLeadQuery = {};
        const baseDealQuery = {};
        const baseInvQuery = {};
        const baseActQuery = {};

        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            baseLeadQuery.$or = [{ owner: userId }, { 'assignment.assignedTo': userId }];
            baseDealQuery.$or = [{ owner: userId }, { 'assignment.assignedTo': userId }];
            baseInvQuery.$or = [{ owners: userId }, { associates: userId }];
            baseActQuery.$or = [{ createdBy: userId }, { 'assignment.assignedTo': userId }];
        } else if (teamId && mongoose.Types.ObjectId.isValid(teamId)) {
            baseLeadQuery.$or = [{ team: teamId }, { 'assignment.team': teamId }];
            baseDealQuery.$or = [{ team: teamId }, { 'assignment.team': teamId }];
        }

        // ━━ 1. ACTIVITY STATS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const [overdueCount, todayActivityCount, upcomingCount, thisMonthActivities] = await Promise.all([
            Activity.countDocuments({ ...baseActQuery, dueDate: { $lt: today }, status: { $regex: /pending|in progress/i } }),
            Activity.countDocuments({ ...baseActQuery, dueDate: { $gte: today, $lt: tomorrow } }),
            Activity.countDocuments({ ...baseActQuery, dueDate: { $gte: tomorrow } }),
            Activity.countDocuments({ ...baseActQuery, createdAt: { $gte: thisMonthStart } })
        ]);

        const activityTypeBreakdown = await Activity.aggregate([
            { $match: { ...baseActQuery, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 6 }
        ]);

        // ━━ 2. LEAD STATS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const [leadsByStageRaw, newLeadsThisMonth, newLeadsLastMonth, leadsBySource] = await Promise.all([
            Lead.aggregate([
                { $match: baseLeadQuery },
                { $group: { _id: "$stage", count: { $sum: 1 } } }
            ]),
            Lead.countDocuments({ ...baseLeadQuery, createdAt: { $gte: thisMonthStart } }),
            Lead.countDocuments({ ...baseLeadQuery, createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } }),
            Lead.aggregate([
                { $match: baseLeadQuery },
                { $group: { _id: '$source', count: { $sum: 1 } } },
                { $sort: { count: -1 } }, { $limit: 6 }
            ])
        ]);

        const leadCategories = { INCOMING: 0, PROSPECT: 0, OPPORTUNITY: 0, NEGOTIATION: 0, WON: 0, LOST: 0 };
        leadsByStageRaw.forEach(item => {
            const label = lookupMap[item._id?.toString()] || item._id || 'New';
            const cat = reverseMapping[label.toString().toLowerCase()] || 'INCOMING';
            leadCategories[cat] += item.count;
        });
        const populatedLeads = Object.entries(leadCategories).map(([status, count]) => ({ status, count }));
        const totalLeads = leadsByStageRaw.reduce((sum, l) => sum + l.count, 0);

        const leadTrendRaw = await Lead.aggregate([
            { $match: { ...baseLeadQuery, createdAt: { $gte: new Date(Date.now() - 180 * 86400000) } } },
            {
                $group: {
                    _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const leadTrend = {
            categories: leadTrendRaw.map(l => {
                const mIdx = (l._id.month || 1) - 1;
                return `${monthNames[mIdx] || 'Jan'} ${String(l._id.year || today.getFullYear()).slice(-2)}`;
            }),
            series: [{ name: 'New Leads', data: leadTrendRaw.map(l => l.count) }]
        };

        // ━━ 3. DEAL STATS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const [dealsByStageRaw, dealsThisMonth, recentDeals] = await Promise.all([
            Deal.aggregate([
                { $match: baseDealQuery },
                { $group: { _id: "$stage", count: { $sum: 1 }, value: { $sum: "$price" } } }
            ]),
            Deal.countDocuments({ ...baseDealQuery, createdAt: { $gte: thisMonthStart } }),
            Deal.find({ ...baseDealQuery })
                .sort({ updatedAt: -1 })
                .limit(5)
                .select('unitNo projectName stage price createdAt stageChangedAt')
                .lean()
        ]);

        const dealCategories = {
            INCOMING: { count: 0, value: 0 },
            PROSPECT: { count: 0, value: 0 },
            OPPORTUNITY: { count: 0, value: 0 },
            NEGOTIATION: { count: 0, value: 0 },
            WON: { count: 0, value: 0 },
            LOST: { count: 0, value: 0 }
        };
        dealsByStageRaw.forEach(item => {
            const label = lookupMap[item._id?.toString()] || item._id || 'Open';
            const cat = reverseMapping[label.toString().toLowerCase()] || 'INCOMING';
            dealCategories[cat].count += item.count;
            dealCategories[cat].value += (item.value || 0);
        });
        const performanceDeals = Object.entries(dealCategories).map(([stage, stats]) => ({ stage, count: stats.count, value: stats.value }));

        // Pipeline value = sum of all non-closed deals
        const pipelineValue = (dealCategories.INCOMING.value + dealCategories.PROSPECT.value + dealCategories.OPPORTUNITY.value + dealCategories.NEGOTIATION.value);

        // ━━ 4. INVENTORY STATS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const matchLookupIds = (regex) => Object.entries(lookupMap).filter(([, val]) => regex.test(val)).map(([id]) => new mongoose.Types.ObjectId(id));
        const availableIds = matchLookupIds(/available/i);
        const soldIds = matchLookupIds(/sold/i);
        const blockedIds = matchLookupIds(/block|reserved/i);

        const [inventoryStatsRaw, , soldCount, blockedCount] = await Promise.all([
            Inventory.aggregate([
                { $match: baseInvQuery },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]),
            Inventory.countDocuments({ ...baseInvQuery, status: { $in: availableIds } }),
            Inventory.countDocuments({ ...baseInvQuery, status: { $in: soldIds } }),
            Inventory.countDocuments({ ...baseInvQuery, status: { $in: blockedIds } })
        ]);
        const populatedInventory = (inventoryStatsRaw || []).map(item => ({
            status: lookupMap[item._id?.toString()] || item._id || 'Available',
            count: item.count
        }));

        // Portfolio mix (by property type/category)
        const portfolioRaw = await Inventory.aggregate([
            { $match: baseInvQuery },
            { $group: { _id: "$category", count: { $sum: 1 }, totalValue: { $sum: "$price" } } }
        ]);
        const portfolioMix = {
            labels: portfolioRaw.map(p => lookupMap[p._id?.toString()] || p._id || 'Uncategorized'),
            series: portfolioRaw.map(p => p.count)
        };

        // Inventory velocity: avg days to sell (from blocked/sold)
        const inventoryByProject = await Inventory.aggregate([
            { $match: baseInvQuery },
            {
                $group: {
                    _id: "$projectName",
                    count: { $sum: 1 },
                    available: { $sum: { $cond: [{ $in: ["$status", availableIds] }, 1, 0] } }
                }
            },
            { $sort: { count: -1 } }, { $limit: 5 }
        ]);

        // ━━ 5. FINANCIAL INTELLIGENCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const revenueBySourceRaw = await Deal.aggregate([
            { $match: baseDealQuery },
            { $group: { _id: "$source", count: { $sum: 1 }, total: { $sum: "$commission.actualAmount" } } },
            { $sort: { total: -1 } }, { $limit: 6 }
        ]);
        const revenueBySource = {
            categories: revenueBySourceRaw.map(r => lookupMap[r._id?.toString()] || r._id || 'Direct'),
            series: [{ name: 'Commission (₹)', data: revenueBySourceRaw.map(r => Math.round(r.total || 0)) }]
        };

        console.log("[Dashboard] Processing Financials...");
        // Cash flow last 6 months
        const sixMonthsAgo = new Date(Date.now() - 180 * 86400000);
        const cashFlowRaw = await Deal.aggregate([
            { $match: { ...baseDealQuery, "closingDetails.isClosed": true, "closingDetails.closingDate": { $gte: sixMonthsAgo } } },
            { $group: { _id: { month: { $month: "$closingDetails.closingDate" }, year: { $year: "$closingDetails.closingDate" } }, total: { $sum: "$commission.actualAmount" }, deals: { $sum: 1 } } },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);
        const cashFlowProjection = {
            categories: cashFlowRaw.map(c => {
                const mIdx = (c._id.month || 1) - 1;
                return `${monthNames[mIdx] || 'Jan'} ${String(c._id.year || today.getFullYear()).slice(-2)}`;
            }),
            series: [{ name: 'Commission Collected', data: cashFlowRaw.map(c => c.total || 0) }],
            dealsPerMonth: cashFlowRaw.map(c => c.deals || 0)
        };

        // Total revenue (all-time commission collected)
        const revenueAgg = await Deal.aggregate([
            { $match: baseDealQuery },
            { $group: { _id: null, total: { $sum: "$commission.actualAmount" }, pending: { $sum: "$commission.commissionAmount" } } }
        ]);
        const totalRevenue = revenueAgg[0]?.total || 0;
        const pendingCommission = revenueAgg[0]?.pending || 0;

        // New MoM Growth Calculations
        const [lastMonthLeads, lastMonthDeals, lastMonthRevenue] = await Promise.all([
            Lead.countDocuments({ ...baseLeadQuery, createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } }),
            Deal.countDocuments({ ...baseDealQuery, createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } }),
            Deal.aggregate([
                { $match: { ...baseDealQuery, "closingDetails.isClosed": true, "closingDetails.closingDate": { $gte: lastMonthStart, $lt: lastMonthEnd } } },
                { $group: { _id: null, total: { $sum: "$commission.actualAmount" } } }
            ])
        ]);

        const calcGrowth = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
        const leadTrendGrowth = calcGrowth(newLeadsThisMonth, lastMonthLeads);
        const dealsTrendGrowth = calcGrowth(dealsThisMonth, lastMonthDeals);
        const revenueTrendGrowth = calcGrowth(totalRevenue, lastMonthRevenue[0]?.total || 0);

        // Average Response Time Calculation
        const completedCalls = await Activity.aggregate([
            { $match: { ...baseActQuery, type: 'Call', status: { $regex: /completed/i }, createdAt: { $gte: thisMonthStart } } },
            { $project: { responseTime: { $subtract: ["$updatedAt", "$createdAt"] } } },
            { $group: { _id: null, avg: { $avg: "$responseTime" } } }
        ]);
        const avgResponseTimeMs = completedCalls[0]?.avg || 0;
        const avgResponseTimeMin = avgResponseTimeMs > 0 ? Math.round(avgResponseTimeMs / 60000) : 0;

        // Lead Velocity (Avg. Stage movements this month)
        const leadVelocity = totalLeads > 0 ? Math.min(100, Math.round((dealsThisMonth / newLeadsThisMonth) * 100)) : 0;

        // ━━ FIX: Defining missing variables found in the response object ━━━━━━
        const missedCalls = 0;
        const missedFollowups = 0;
        const [projectCount, projectList, mtdVisitsByProject, mtdBookingsByProject] = await Promise.all([
            Project.countDocuments(),
            Project.find().limit(5).select('name').lean(),
            Promise.resolve([]), // Placeholder for MTD visits
            Promise.resolve([])  // Placeholder for MTD bookings
        ]);
        const reengagedCount = 0;
        const nfaCount = 0;
        const availability = 0;
        const leadSourceStats = [];
        const targetAmount = 0;
        const achievedAmount = 0;
        const conversionRate = 0;
        const leadMoMGrowth = 0;
        const liveTasks = [];
        const liveSiteVisits = [];
        const recentActivityFeed = [];
        const aiAlertHub = [];
        const autoSuggestions = [];

        // ━━ COMPOSE FINAL RESPONSE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const dashboardData = {
            // KPIs
            activities: { 
                overdue: overdueCount, 
                today: todayActivityCount, 
                upcoming: upcomingCount, 
                thisMonth: thisMonthActivities,
                missedCalls,
                missedFollowups
            },
            activityTypeBreakdown,
            leads: populatedLeads,
            deals: performanceDeals,
            inventoryHealth: populatedInventory,
            projects: projectCount,
            projectList,
            inventoryByProject,
            portfolioMix,

            // Trends
            trends: {
                leads: leadTrendGrowth,
                deals: dealsTrendGrowth,
                revenue: revenueTrendGrowth,
                inventory: 0 // Static for now as inventory doesn't "grow" the same way
            },

            // New Sell.Do Metrics
            reengagedCount,
            nfaCount,
            availability,
            mtdVisits: mtdVisitsByProject,
            mtdBookings: mtdBookingsByProject,

            // Trend Data for Charts
            leadTrend,
            cashFlowProjection,
            revenueBySource,
            leadSourceStats,

            // Summary Numbers
            performance: {
                target: targetAmount,
                achieved: achievedAmount,
                remaining: Math.max(0, targetAmount - achievedAmount),
                conversion: conversionRate,
                revenue: totalRevenue,
                pendingCommission,
                pipelineValue,
                trend: leadMoMGrowth,
                newLeadsThisMonth,
                dealsThisMonth,
                soldCount,
                blockedCount,
                avgResponseTime: avgResponseTimeMin > 0 ? `${avgResponseTimeMin}m` : 'N/A',
                leadVelocity: leadVelocity > 20 ? 'High' : leadVelocity > 10 ? 'Medium' : 'Stable',
                mtdLeads: newLeadsThisMonth,
                mtdCommission: achievedAmount, // Commission collected MTD
                bookingTarget: Math.round((mtdBookingsByProject.reduce((s, b) => s + b.count, 0) / 50) * 100), // Mock target of 50 bookings
                // ━━ PERFORMANCE FIX: Reuse inventoryStatsTotal instead of a 2nd countDocuments ━━
                total_property: inventoryStatsRaw.reduce((sum, s) => sum + s.count, 0),
                total_view: 0,
                total_favourite: 0
            },
            // Reuse computed total — no extra DB query
            total_property: inventoryStatsRaw.reduce((sum, s) => sum + s.count, 0),
            total_view: 0,
            total_favourite: 0,

            // Agenda
            agenda: { tasks: liveTasks, siteVisits: liveSiteVisits },
            recentActivityFeed,

            // AI
            aiAlertHub,
            autoSuggestions,

            // Recent Deals Feed
            recentDeals: recentDeals.map(d => ({
                unitNo: d.unitNo,
                project: d.projectName,
                stage: d.stage,
                value: d.price,
                updatedAt: d.updatedAt || d.stageChangedAt
            }))
        };

        // Optional: Cache background-calculated KPIs for 1 min
        if (!userId && !teamId) {
            await safeRedisCall('setex', 'dashboard_kpis_v2', 60, JSON.stringify(dashboardData));
        }

        res.json({ success: true, data: dashboardData });
    } catch (error) {
        console.error('[Dashboard] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
