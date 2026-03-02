import Lead from "../models/Lead.js";
import Activity from "../models/Activity.js";
import Deal from "../models/Deal.js";
import Lookup from "../models/Lookup.js";
import Inventory from "../models/Inventory.js";
import Project from "../models/Project.js";
import redisConnection from "../src/config/redis.js";

export const getDashboardStats = async (req, res) => {
    try {
        const cachedKpis = await redisConnection.get('dashboard_kpis').catch(() => null);
        if (cachedKpis) {
            return res.json({ success: true, data: JSON.parse(cachedKpis), cached: true });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch lookups for stage and status mapping
        const lookups = await Lookup.find({ lookup_type: { $in: ['Stage', 'InventoryStatus', 'Status'] } });
        const stageMap = {};
        const lookupMap = {};
        lookups.forEach(l => {
            if (l.lookup_type === 'Stage') stageMap[l._id.toString()] = l.lookup_value;
            lookupMap[l._id.toString()] = l.lookup_value;
        });

        const CATEGORY_MAPPING = {
            'INCOMING': ['New', 'Inbound', 'Incoming', 'Open', 'Lead', 'Unassigned'],
            'PROSPECT': ['Prospect', 'Qualified', 'Warm', 'Interested', 'Follow-up'],
            'OPPORTUNITY': ['Opportunity', 'Hot', 'Quote', 'Proposal', 'Presentation', 'Site Visit'],
            'NEGOTIATION': ['Negotiation', 'Booked', 'Under Review', 'Contract', 'Reserved'],
            'CLOSED': ['Closed Won', 'Closed Lost', 'Stalled', 'Dead', 'Won', 'Lost', 'Cancelled']
        };

        const reverseMapping = {};
        Object.entries(CATEGORY_MAPPING).forEach(([cat, stages]) => {
            stages.forEach(s => { reverseMapping[s.toLowerCase()] = cat; });
        });

        // 1. Activity Stats (Simplified for reliability)
        const [overdueCount, todayActivityCount, upcomingCount] = await Promise.all([
            Activity.countDocuments({ dueDate: { $lt: today }, status: { $regex: /pending|in progress/i } }),
            Activity.countDocuments({ dueDate: { $gte: today, $lt: tomorrow } }),
            Activity.countDocuments({ dueDate: { $gte: tomorrow } })
        ]);

        const activityCounts = {
            overdue: [{ count: overdueCount }],
            today: [{ count: todayActivityCount }],
            upcoming: [{ count: upcomingCount }]
        };

        // 2. Lead Stages Aggregated
        const leadsByStageRaw = await Lead.aggregate([
            { $group: { _id: "$stage", count: { $sum: 1 } } }
        ]);

        const leadCategories = { INCOMING: 0, PROSPECT: 0, OPPORTUNITY: 0, NEGOTIATION: 0, CLOSED: 0 };
        leadsByStageRaw.forEach(item => {
            // item._id could be an ObjectId (standard) or a String (direct value/legacy)
            let stageValue = 'New';
            if (item._id) {
                if (mongoose.Types.ObjectId.isValid(item._id)) {
                    stageValue = stageMap[item._id.toString()] || 'New';
                } else {
                    stageValue = String(item._id);
                }
            }

            const cat = reverseMapping[stageValue.toLowerCase()] || 'INCOMING';
            leadCategories[cat] += item.count;
        });

        const populatedLeads = Object.entries(leadCategories).map(([status, count]) => ({ status, count }));

        // 3. Deal Stats Aggregated
        const dealsByStageRaw = await Deal.aggregate([
            { $group: { _id: "$stage", count: { $sum: 1 }, value: { $sum: "$price" } } }
        ]);

        const dealCategories = {
            INCOMING: { count: 0, value: 0 },
            PROSPECT: { count: 0, value: 0 },
            OPPORTUNITY: { count: 0, value: 0 },
            NEGOTIATION: { count: 0, value: 0 },
            CLOSED: { count: 0, value: 0 }
        };

        dealsByStageRaw.forEach(item => {
            const stageValue = item._id || 'Open';
            // Map 'Open' to INCOMING, 'quote' to OPPORTUNITY for legacy compatibility
            let normalizedStage = stageValue.toLowerCase();
            if (normalizedStage === 'open') normalizedStage = 'new';
            if (normalizedStage === 'quote') normalizedStage = 'opportunity';

            const cat = reverseMapping[normalizedStage] || 'INCOMING';
            dealCategories[cat].count += item.count;
            dealCategories[cat].value += (item.value || 0);
        });

        // Debug logging for developers
        console.log(`[Dashboard] Aggregated ${totalLeads} leads into categories:`, leadCategories);
        console.log(`[Dashboard] Aggregated deals by stage:`, dealCategories);

        const performanceDeals = Object.entries(dealCategories).map(([stage, stats]) => ({
            stage,
            count: stats.count,
            value: stats.value
        }));

        // 4. Performance Metrics
        const achievedAmount = dealCategories['CLOSED'].value || 0;
        const targetAmount = 50000000; // Target: ₹5Cr
        const revenueAggregation = await Deal.aggregate([
            { $group: { _id: null, total: { $sum: "$commission.actualAmount" } } }
        ]);
        const totalRevenue = revenueAggregation[0]?.total || 0;

        const totalLeads = leadsByStageRaw.reduce((sum, l) => sum + l.count, 0) || 1;
        const wonLeadsCount = leadCategories['CLOSED'] || 0;
        const conversionRate = (wonLeadsCount / totalLeads) * 100;

        const populatedInventory = (inventoryStatsRaw || []).map(item => ({
            status: lookupMap[item._id?.toString()] || 'Available',
            count: item.count
        }));

        // 6. Project Stats
        const projectCount = await Project.countDocuments({ status: { $ne: 'Deleted' } });

        // 6. High Value Agenda (Live Tasks & Site Visits)
        const agendaActivities = await Activity.find({
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
                status: a.dueDate < today ? 'overdue' : 'due'
            })).slice(0, 5);

        const liveSiteVisits = agendaActivities
            .filter(a => a.type === 'Site Visit')
            .map(a => ({
                id: a._id,
                target: a.subject,
                client: a.relatedTo?.[0]?.name || 'N/A',
                time: a.dueTime || 'Planned'
            })).slice(0, 5);

        // 7. Contextual AI Smart Insights
        // 7. Contextual AI Smart Insights

        const aiAlertHub = {
            followupFailure: activityCounts.overdue?.[0]?.count > 0 ? [{
                id: 'fail-1',
                title: 'Follow-up Latency',
                message: `${activityCounts.overdue?.[0]?.count || 0} leads are awaiting contact. Response time directly affects conversion.`,
                type: 'critical',
                actions: ['View All', 'Quick Call']
            }] : [],
            hotLeads: (populatedLeads.find(l => l.status === 'PROSPECT')?.count || 0) > 5 ? [{
                id: 'hot-1',
                title: 'High Intent Hub',
                message: `${populatedLeads.find(l => l.status === 'PROSPECT')?.count} prospects are active. Site visit conversion is 3x higher.`,
                type: 'hot',
                actions: ['Priority List']
            }] : [],
            inventory: populatedInventory.length > 0 ? [{
                id: 'inv-1',
                title: 'Inventory Flow',
                message: 'New listings detected. Match these with active prospects for immediate engagement.',
                type: 'info',
                actions: ['Match Leads']
            }] : []
        };

        const autoSuggestions = {
            leads: (activityCounts.overdue?.[0]?.count || 0) > 10 ? [{ id: 'sug-1', text: 'Overdue list is growing. Consider reassigning lead ownership.', type: 'optimization' }] : [],
            performance: conversionRate < 10 ? [{ id: 'sug-2', text: 'Lead conversion is below benchmark. Review qualification process.', type: 'training' }] : [{ id: 'sug-3', text: 'Optimal performance! Maintain current follow-up cadence.', type: 'growth' }],
            pipeline: (achievedAmount / targetAmount) < 0.5 ? [{ id: 'sug-4', text: 'Pipeline recovery is behind target. Focus on negotiation closings.', type: 'strategy' }] : []
        };

        const dashboardData = {
            activities: {
                overdue: overdueCount,
                today: todayActivityCount,
                upcoming: upcomingCount
            },
            agenda: {
                tasks: liveTasks,
                siteVisits: liveSiteVisits
            },
            aiAlertHub,
            autoSuggestions,
            performance: {
                target: targetAmount,
                achieved: achievedAmount,
                remaining: Math.max(0, targetAmount - achievedAmount),
                conversion: Math.round(conversionRate),
                revenue: totalRevenue,
                trend: 14
            },
            leads: populatedLeads,
            deals: performanceDeals,
            inventoryHealth: populatedInventory,
            projects: projectCount
        };

        // Cache for 1 minute (60 seconds)
        await redisConnection.setex('dashboard_kpis', 60, JSON.stringify(dashboardData)).catch(() => null);

        res.json({
            success: true,
            data: dashboardData
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
