import Lead from "../models/Lead.js";
import Activity from "../models/Activity.js";
import Deal from "../models/Deal.js";
import Lookup from "../models/Lookup.js";

export const getDashboardStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch lookups for status name mapping
        const lookups = await Lookup.find({ lookup_type: { $in: ['lead_status', 'inventory_status', 'deal_stage'] } });
        const lookupMap = {};
        lookups.forEach(l => { lookupMap[l._id.toString()] = l.lookup_value; });

        // 1. Activity Stats
        const activityStats = await Activity.aggregate([
            {
                $facet: {
                    overdue: [
                        { $match: { dueDate: { $lt: today }, status: { $ne: 'Completed' } } },
                        { $count: "count" }
                    ],
                    today: [
                        { $match: { dueDate: { $gte: today, $lt: tomorrow } } },
                        { $count: "count" }
                    ],
                    upcoming: [
                        { $match: { dueDate: { $gte: tomorrow } } },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        // 2. Lead Stages & Performance
        const leadsByStatusRaw = await Lead.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        const totalLeads = leadsByStatusRaw.reduce((sum, l) => sum + l.count, 0);
        const populatedLeads = leadsByStatusRaw.map(item => ({
            status: lookupMap[item._id?.toString()] || 'Unknown',
            count: item.count
        }));

        // 3. Deal Stats & Revenue
        const dealStats = await Deal.aggregate([
            {
                $facet: {
                    byStage: [
                        { $group: { _id: "$stage", count: { $sum: 1 }, value: { $sum: "$price" } } }
                    ],
                    achieved: [
                        { $match: { stage: { $in: ['Booked', 'Closed'] } } },
                        { $group: { _id: null, total: { $sum: "$price" } } }
                    ],
                    revenue: [
                        { $group: { _id: null, total: { $sum: "$commission.actualAmount" } } }
                    ]
                }
            }
        ]);

        const achievedAmount = dealStats[0].achieved[0]?.total || 0;
        const targetAmount = 5000000; // Dynamic or fixed target: ₹50L
        const totalRevenue = dealStats[0].revenue[0]?.total || 0;

        // Calculate Conversion % (Won Leads / Total Leads)
        const wonLeadsCount = populatedLeads.find(l => l.status.toLowerCase().includes('won'))?.count || 0;
        const conversionRate = totalLeads > 0 ? (wonLeadsCount / totalLeads) * 100 : 0;

        // 4. Inventory Health
        const inventoryStatsRaw = await Inventory.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        const populatedInventory = inventoryStatsRaw.map(item => ({
            status: lookupMap[item._id?.toString()] || 'Available',
            count: item.count
        }));

        res.json({
            success: true,
            data: {
                activities: {
                    overdue: activityStats[0].overdue[0]?.count || 0,
                    today: activityStats[0].today[0]?.count || 0,
                    upcoming: activityStats[0].upcoming[0]?.count || 0
                },
                performance: {
                    target: targetAmount,
                    achieved: achievedAmount,
                    remaining: Math.max(0, targetAmount - achievedAmount),
                    conversion: conversionRate,
                    revenue: totalRevenue,
                    trend: 12 // Placeholder for trend
                },
                leads: populatedLeads,
                deals: dealStats[0].byStage.map(d => ({ stage: d._id, count: d.count, value: d.value })),
                inventoryHealth: populatedInventory
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
