import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Lookup from '../models/Lookup.js';

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
