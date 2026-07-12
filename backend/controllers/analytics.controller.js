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

        const leadQuery = { isLost: { $ne: true }, ...dateFilter };
        // We will fetch all active leads
        const leads = await Lead.find(leadQuery)
            .select('stage stageChangedAt createdAt status owner')
            .populate('stage', 'lookup_value')
            .populate('status', 'lookup_value')
            .populate('owner', 'fullName name')
            .lean();

        const formattedLeads = leads.map(l => {
            const stageName = l.stage?.lookup_value || l.stage || 'Incoming';
            const statusName = l.status?.lookup_value || l.status || '';
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
                agentName
            };
        });

        const dealQuery = { isVisible: true, ...dateFilter };
        // Also fetch active Deals for revenue forecast
        const deals = await Deal.find(dealQuery)
            .select('stage price expectedCommission stageChangedAt createdAt assignedTo')
            .populate('stage', 'lookup_value')
            .populate('assignedTo', 'fullName name')
            .lean();
            
        const formattedDeals = deals.map(d => {
            const stageName = d.stage?.lookup_value || d.stage || 'Open';
            const agentName = d.assignedTo?.fullName || d.assignedTo?.name || 'Unassigned';
            return {
                stage: stageName === 'Closed Won' ? 'Closed' : stageName, // Fix legacy data
                price: d.price || 0,
                commission: d.expectedCommission || 0,
                createdAt: d.createdAt,
                stageChangedAt: d.stageChangedAt,
                agentName
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
