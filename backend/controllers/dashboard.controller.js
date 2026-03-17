import Activity from "../models/Activity.js";
import Lead from "../models/Lead.js";
import Deal from "../models/Deal.js";
import Lookup from "../models/Lookup.js";
import Inventory from "../models/Inventory.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import Team from "../models/Team.js";
import mongoose from "mongoose";
import redisConnection, { safeRedisCall } from "../src/config/redis.js";

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
        console.log("[Dashboard] Fetching Activity stats...");
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
        console.log("[Dashboard] Fetching Lead stats...");
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
        console.log("[Dashboard] Fetching Deal stats...");
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
        console.log("[Dashboard] Fetching Inventory stats...");
        const matchLookupIds = (regex) => Object.entries(lookupMap).filter(([_, val]) => regex.test(val)).map(([id]) => new mongoose.Types.ObjectId(id));
        const availableIds = matchLookupIds(/available/i);
        const soldIds = matchLookupIds(/sold/i);
        const blockedIds = matchLookupIds(/block|reserved/i);

        const [inventoryStatsRaw, availableCount, soldCount, blockedCount] = await Promise.all([
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

        // ━━ 6. PERFORMANCE METRICS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const achievedAmount = dealCategories['WON'].value || 0;
        const targetAmount = 50000000; // ₹5Cr monthly target
        const wonLeadsCount = leadCategories['WON'] || 0;
        const conversionRate = Math.round((wonLeadsCount / totalLeads) * 100);
        const leadMoMGrowth = lastMonthStart > 0 && newLeadsLastMonth > 0
            ? Math.round(((newLeadsThisMonth - newLeadsLastMonth) / newLeadsLastMonth) * 100)
            : 0;

        // ━━ 7. PROJECT STATS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const deletedProjectIds = matchLookupIds(/deleted/i);
        const projectQuery = deletedProjectIds.length > 0 ? { status: { $nin: deletedProjectIds } } : {};

        const [projectCountRaw, projectListRaw] = await Promise.all([
            Project.countDocuments(projectQuery),
            Project.find(projectQuery).select('name status location units').limit(5).lean()
        ]);

        const projectCount = projectCountRaw;
        const projectList = projectListRaw.map(p => ({
            ...p,
            status: lookupMap[p.status?.toString()] || p.status || 'Active'
        }));

        // ━━ 8. AGENDA (Today's Tasks & Site Visits) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const agendaActivities = await Activity.find({
            ...baseActQuery,
            $or: [
                { dueDate: { $lt: tomorrow }, status: { $regex: /pending|in progress/i } },
                { dueDate: { $gte: today, $lt: tomorrow } }
            ]
        }).sort({ dueDate: 1, dueTime: 1 }).limit(20);

        const liveTasks = agendaActivities
            .filter(a => a.type !== 'Site Visit')
            .map(a => ({
                id: a._id,
                title: a.subject,
                target: a.relatedTo?.[0]?.name || 'Internal',
                time: a.dueTime || 'All Day',
                status: a.dueDate < today ? 'overdue' : 'due',
                type: a.type
            })).slice(0, 5);

        const liveSiteVisits = agendaActivities
            .filter(a => a.type === 'Site Visit')
            .map(a => ({
                id: a._id,
                target: a.subject,
                client: a.relatedTo?.[0]?.name || 'N/A',
                time: a.dueTime || 'Planned',
                status: a.dueDate < today ? 'overdue' : 'due'
            })).slice(0, 5);

        // ━━ 9. TOP PERFORMERS (Leads by source) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const leadSourceStats = leadsBySource.map(s => ({
            source: lookupMap[s._id?.toString()] || s._id || 'Direct',
            count: s.count
        }));

        // ━━ 10. RECENT ACTIVITY FEED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const recentActivityFeed = await Activity.find({})
            .sort({ createdAt: -1 })
            .limit(8)
            .select('type subject status relatedTo createdAt outcome')
            .lean();

        // ━━ 11. SELL.DO INSPIRED METRICS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const [reengagedCount, nfaCount, missedCalls, missedFollowups, userAvailability, mtdVisitsByProject, mtdBookingsByProject] = await Promise.all([
            // Reengaged: Created before this month, activity this month
            Lead.countDocuments({
                ...baseLeadQuery,
                createdAt: { $lt: thisMonthStart },
                lastActivityAt: { $gte: thisMonthStart }
            }),
            // NFA: No future activity
            Lead.countDocuments({
                ...baseLeadQuery,
                _id: {
                    $nin: await Activity.distinct('relatedTo.id', {
                        dueDate: { $gte: today },
                        status: { $regex: /pending|in progress/i }
                    })
                }
            }),
            // Missed Calls
            Activity.countDocuments({
                ...baseActQuery,
                type: 'Call',
                status: { $regex: /pending|in progress/i },
                dueDate: { $lt: today }
            }),
            // Missed Followups (Tasks/Meetings)
            Activity.countDocuments({
                ...baseActQuery,
                type: { $in: ['Task', 'Meeting', 'Follow-up'] },
                status: { $regex: /pending|in progress/i },
                dueDate: { $lt: today }
            }),
            // User Availability
            User.aggregate([
                { $match: { isActive: true } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            // MTD Visits by Project
            Activity.aggregate([
                { $match: { ...baseActQuery, type: 'Site Visit', createdAt: { $gte: thisMonthStart } } },
                {
                    $project: {
                        projectName: '$details.projectName',
                        isCompleted: {
                            $let: {
                                vars: { statusVal: { $toString: '$status' } },
                                in: {
                                    $or: [
                                        { $eq: ["$$statusVal", "Completed"] },
                                        { $in: ["$status", matchLookupIds(/completed/i)] }
                                    ]
                                }
                            }
                        }
                    }
                },
                { $group: { _id: '$projectName', count: { $sum: 1 }, conducted: { $sum: { $cond: ["$isCompleted", 1, 0] } } } },
                { $sort: { count: -1 } }
            ]),
            // MTD Bookings by Project
            Deal.aggregate([
                {
                    $match: {
                        ...baseDealQuery,
                        $or: [
                            { stage: 'Booked' },
                            { stage: { $in: matchLookupIds(/booked/i) } }
                        ],
                        createdAt: { $gte: thisMonthStart }
                    }
                },
                { $group: { _id: '$projectName', count: { $sum: 1 }, value: { $sum: '$price' } } },
                { $sort: { count: -1 } }
            ])
        ]);

        const availability = { totalIn: 0, totalNotIn: 0, totalOnLeave: 0 };
        userAvailability.forEach(ua => {
            if (ua._id === 'active') availability.totalIn = ua.count;
            else availability.totalNotIn += ua.count;
        });

        // ━━ 12. AI ALERT HUB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const aiAlertHub = {
            followupFailure: overdueCount > 0 ? [{
                id: 'fail-1',
                title: 'Follow-up Latency',
                message: `${overdueCount} leads are awaiting contact. Response time < 1h boosts conversion by 60%.`,
                type: 'critical',
                actions: ['View All', 'Quick Call'],
                count: overdueCount
            }] : [],
            hotLeads: (leadCategories['PROSPECT'] || 0) > 0 ? [{
                id: 'hot-1',
                title: 'Hot Prospects',
                message: `${leadCategories['PROSPECT']} prospects are in active stage. Site visit conversion is 3x higher.`,
                type: 'hot',
                actions: ['Priority List'],
                count: leadCategories['PROSPECT']
            }] : [],
            stuckDeals: (dealCategories['NEGOTIATION']?.count || 0) > 0 ? [{
                id: 'stuck-1',
                title: 'Stalled Negotiations',
                message: `${dealCategories['NEGOTIATION'].count} deals in negotiation. Proactive follow-up can rescue 40% of stalled deals.`,
                type: 'warning',
                actions: ['Review Deals'],
                count: dealCategories['NEGOTIATION'].count
            }] : [],
            inventory: populatedInventory.length > 0 ? [{
                id: 'inv-1',
                title: 'Inventory Mismatch',
                message: 'New listings available. Match with active prospects for immediate engagement.',
                type: 'info',
                actions: ['Match Leads']
            }] : []
        };

        const autoSuggestions = {
            leads: overdueCount > 5 ? [{ id: 'sug-1', text: 'Overdue follow-ups growing. Consider bulk reassignment or sequence enrollment.', type: 'optimization' }] : [],
            performance: conversionRate < 10
                ? [{ id: 'sug-2', text: 'Lead conversion below benchmark. Review qualification and follow-up cadence.', type: 'training' }]
                : [{ id: 'sug-3', text: 'Strong conversion rate! Focus on increasing new lead volume for exponential growth.', type: 'growth' }],
            pipeline: pipelineValue < targetAmount * 0.5
                ? [{ id: 'sug-4', text: 'Pipeline below ₹2.5Cr. Accelerate negotiation and site visit scheduling.', type: 'strategy' }]
                : [{ id: 'sug-5', text: 'Pipeline healthy. Prioritize closure of negotiation-stage deals this week.', type: 'growth' }],
            strategy: [{ id: 'sug-6', text: 'Add enrichment to all new leads within 2 hours. AI match score jumps by 35%.', type: 'strategy' }]
        };

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
                total_property: await Inventory.countDocuments(baseInvQuery),
                total_view: 0, // Placeholder as views aren't explicitly tracked yet
                total_favourite: 0 // Placeholder as favorites aren't explicitly tracked yet
            },
            // Explicitly add for mobile dashboard mapping if needed
            total_property: await Inventory.countDocuments(baseInvQuery),
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
            })),

            // Top lead sources
            leadSourceStats
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
