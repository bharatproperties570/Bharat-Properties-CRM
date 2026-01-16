export const reportsData = {
    // 1. TOP PRIORITY ACTION STRIP
    priorityAlerts: [
        { id: 'overdue', label: 'Overdue Follow-ups', value: 12, color: 'red', icon: 'fa-calendar-times' },
        { id: 'no-followup', label: 'No Follow-up Leads', value: 25, color: 'orange', icon: 'fa-user-clock' },
        { id: 'untouched', label: 'Untouched Leads', value: 8, color: 'red', icon: 'fa-user-slash', blink: true },
        { id: 'missed', label: 'Missed Calls', value: 5, color: 'red', icon: 'fa-phone-slash' },
        { id: 'reengaged', label: 'Returning Leads', value: 18, color: 'green', icon: 'fa-undo' },
        { id: 'visits', label: 'Today’s Site Visits', value: 4, color: 'blue', icon: 'fa-car' }
    ],

    // 2. CONTEXTUAL AI ALERTS
    aiAlertHub: {
        followupFailure: [
            { id: 1, title: 'Lost Opportunity Warning', message: '254 leads untouched for >24h. Conversion dropping by 40%.', type: 'critical', actions: ['Call Now', 'WhatsApp', 'Reassign'] },
            { id: 2, title: 'Overdue Follow-ups', message: '243 leads missed their scheduled contact today.', type: 'high', actions: ['Auto-Schedule'] }
        ],
        hotLeads: [
            { id: 3, title: 'High Intent Detected', message: '34 returning leads detected. Lead "Amit Sharma" revisited Sector 5 list 5 times today.', type: 'hot', actions: ['Priority Call', 'Send Offer'] },
            { id: 4, title: 'Rapid Engagement', message: 'Lead "Karan" active now. Last call was 12 mins. Send site visit invite?', type: 'info', actions: ['Invite Visit'] }
        ],
        stuckDeals: [
            { id: 5, title: 'Frozen Capital', message: '₹18.5 Cr stuck in Opportunity stage for >12 days.', type: 'financial', actions: ['Escalate', 'Price Revision'] },
            { id: 6, title: 'High Value Stagnation', message: 'Villa Deal (₹4.5 Cr) has no activity since 10 days.', type: 'warning', actions: ['Owner Involvement'] }
        ],
        communication: [
            { id: 7, title: 'Revenue Leakage', message: '37 missed calls detected in last 4 hours.', type: 'critical', actions: ['Call Back All'] },
            { id: 8, title: 'Optimal Window', message: 'Best calling window (11:30 AM - 1:00 PM) starting in 20 mins.', type: 'info', actions: ['Start Dialer'] }
        ],
        inventory: [
            { id: 9, title: 'Listing Aging', message: 'Plot-1550 listed for 45 days without offers. Review pricing?', type: 'warning', actions: ['Market Analysis', 'Price Drop'] }
        ]
    },

    // 3. LEGACY STRATEGIC INSIGHTS (Needed for ReportsView)
    smartActions: [
        { title: 'Follow-up with 12 High-Intent Leads', desc: 'Leads from Sector 5 showed 40% more activity today.', priority: 'critical', impact: 'High', icon: 'fa-fire' },
        { title: 'Re-assign 8 Stagnant Deals', desc: 'Deals in "Opportunity" stage for >10 days need fresh eyes.', priority: 'high', impact: 'Medium', icon: 'fa-users' },
        { title: 'Push Sector 4 Inventory', desc: 'Demand is peaking but inventory views are low.', priority: 'normal', impact: 'ROI Focus', icon: 'fa-home' }
    ],
    revenueForecast: {
        heatmap: [
            { name: 'Sector 5', data: [{ x: 'Jan', y: 12 }, { x: 'Feb', y: 45 }, { x: 'Mar', y: 78 }, { x: 'Apr', y: 34 }] },
            { name: 'Sector 4', data: [{ x: 'Jan', y: 22 }, { x: 'Feb', y: 15 }, { x: 'Mar', y: 58 }, { x: 'Apr', y: 94 }] },
            { name: 'Sector 8', data: [{ x: 'Jan', y: 52 }, { x: 'Feb', y: 35 }, { x: 'Mar', y: 28 }, { x: 'Apr', y: 44 }] }
        ]
    },
    radar: {
        series: [{ name: 'Current Skills', data: [80, 50, 30, 40, 100, 20] }, { name: 'Target', data: [90, 90, 90, 90, 90, 90] }],
        labels: ['Follow-up', 'Closure', 'Inventory Knowledge', 'Tech Usage', 'Attendance', 'Team Collaboration']
    },
    persona: {
        series: [65, 35],
        labels: ['Home Buyer', 'Real Estate Investor']
    },
    hotspots: {
        treemap: { data: [{ x: 'Sector 5', y: 45 }, { x: 'Sector 4', y: 28 }, { x: 'Sector 8', y: 18 }, { x: 'Sector 12', y: 15 }, { x: 'Others', y: 12 }] }
    },
    engagement: {
        bubble: [{ name: 'WhatsApp', data: [[1, 45, 10], [5, 80, 20], [12, 30, 15]] }, { name: 'Calls', data: [[2, 60, 12], [8, 90, 25], [15, 40, 18]] }]
    },
    aging: {
        series: [{ name: 'Deal Value (₹ Cr)', data: [12, 18, 25, 8] }],
        categories: ['0-7 Days', '8-15 Days', '16-30 Days', '30+ Days']
    },
    velocity: {
        series: [45, 85, 32, 58, 92],
        labels: ['Lead-to-Call', 'Call-to-Visit', 'Visit-to-Offer', 'Offer-to-Booking', 'Lead-to-Exit']
    },

    // 4. LEGACY SECTION DATA (Needed for ReportsView)
    activity: {
        kpis: [{ label: 'Total Tasks', value: 145 }, { label: 'Completed', value: 92 }, { label: 'Overdue', value: 12 }, { label: 'Productivity', value: '84%' }],
        stackedBar: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], series: [{ name: 'Calls', data: [44, 55, 41, 67, 22] }, { name: 'Visits', data: [13, 23, 20, 8, 13] }] },
        lineTrend: { categories: ['Jan', 'Feb', 'Mar', 'Apr'], series: [{ name: 'Activity Score', data: [31, 40, 28, 51] }] }
    },
    leadStage: {
        alerts: [{ label: 'Untouched', value: 25, color: 'red' }, { label: 'Following Up', value: 142, color: 'blue' }, { label: 'Stale', value: 12, color: 'orange' }, { label: 'Closed', value: 8, color: 'green' }],
        donut: { series: [44, 55, 13, 33], labels: ['Incoming', 'Prospect', 'Opportunity', 'Negotiation'] },
        bar: { categories: ['Agent A', 'Agent B', 'Agent C'], series: [{ name: 'Leads', data: [40, 30, 20] }] }
    },
    voice: {
        bar: { categories: ['Suraj', 'Varun', 'Rajesh'], series: [{ name: 'Calls', data: [45, 32, 28] }] },
        gauge: 72
    },
    marketing: {
        bar: { categories: ['FB', '99Acres', 'MagicBricks'], series: [{ name: 'Leads', data: [85, 42, 38] }] },
        donut: { series: [15, 8, 5], labels: ['FB', '99Acres', 'Portal'] },
        trend: { categories: ['W1', 'W2', 'W3'], series: [{ name: 'Leads', data: [20, 35, 28] }] }
    },
    funnel: {
        kpis: [{ label: 'Inbound', value: 150 }, { label: 'Qualified', value: 85 }, { label: 'Conversion', value: '18%' }],
        categories: ['Leads', 'Qualified', 'Visit', 'Booking'],
        series: [{ name: 'Count', data: [150, 85, 40, 15] }]
    },
    sales: {
        line: { categories: ['Jan', 'Feb', 'Mar'], series: [{ name: 'Actual', data: [12, 18, 25] }, { name: 'Forecast', data: [15, 20, 22] }] },
        bar: { categories: ['Suraj', 'Varun'], series: [{ name: 'Sales', data: [3.5, 2.1] }] }
    },

    // 5. AUTO SUGGESTIONS
    autoSuggestions: {
        leads: [
            { id: 1, text: 'Amit Sharma matches 3 active properties in Sector 4.', type: 'match' },
            { id: 2, text: 'Rohan (Investor) - Suggesting bulk deal on Sector 5 Plots.', type: 'strategy' }
        ],
        performance: [
            { id: 3, text: 'Agent Rajesh: High lead volume but 2% conversion. Training recommended.', type: 'training' },
            { id: 4, text: 'Reassign Sector 5 leads to Suraj (Top Performer in this area).', type: 'optimization' }
        ],
        pipeline: [
            { id: 5, text: 'Most deals drop at Prospect stage. Improve qualification script.', type: 'logic' },
            { id: 6, text: 'Site visits improve your conversion by 28%. Push more visits.', type: 'growth' }
        ],
        strategy: [
            { id: 7, text: 'Reference leads convert 3x better. Focus on referral program.', type: 'roi' },
            { id: 8, text: 'Marketing ROI low on Portal leads. Shifting budget to FB Ads.', type: 'roi' }
        ]
    },

    // 6. DASHBOARD SPECIFIC (Phase 6 New)
    financialIntelligence: {
        cashFlowProjection: {
            series: [{ name: 'Projected Recovery (₹ Cr)', data: [12.5, 18.2, 14.8, 22.5] }],
            categories: ['Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026']
        },
        portfolioMix: {
            series: [55, 25, 12, 8],
            labels: ['Residential Plots', 'Villas', 'Commercial Shops', 'Industrial']
        },
        revenueBySource: {
            series: [{ name: 'Revenue (₹ Cr)', data: [42, 28, 15, 12, 5] }],
            categories: ['Reference', 'FB Ads', '99Acres', 'MagicBricks', 'Direct']
        }
    },
    operationalIntelligence: {
        sectorHotspots: {
            series: [{ data: [{ x: 'Sector 5', y: 45 }, { x: 'Sector 4', y: 28 }, { x: 'Sector 8', y: 18 }, { x: 'Sector 12', y: 15 }, { x: 'Sector 2', y: 12 }, { x: 'Kurukshetra Ext', y: 8 }] }]
        },
        leadVelocityIndex: {
            series: [{ name: 'Avg. Days', data: [1.2, 4.5, 12.0, 7.5, 3.2] }],
            categories: ['Fresh → Prospect', 'Pros → Opp', 'Opp → Block', 'Block → Sold', 'Lead Exit']
        }
    },
    filterOptions: {
        sectors: ['All Sectors', 'Sector 5', 'Sector 4', 'Sector 8', 'Sector 12', 'Kurukshetra Ext'],
        agents: ['All Agents', 'Suraj', 'Varun', 'Rajesh', 'Anil', 'System'],
        sources: ['All Sources', 'Reference', 'Facebook', '99Acres', 'MagicBricks', 'Direct Walk-in']
    },
    leadHealth: {
        distribution: { series: [45, 30, 15, 7, 3], labels: ['Incoming', 'Prospect', 'Opportunity', 'Booked', 'Unqualified'] },
        byStage: { series: [{ name: 'Leads', data: [120, 85, 42, 18, 12] }], categories: ['Incoming', 'Prospect', 'Opportunity', 'Booked', 'Unqualified'] }
    },
    pipelineMoney: {
        funnel: { series: [{ name: 'Leads', data: [150, 100, 60, 30, 15] }], categories: ['Incoming', 'Prospect', 'Opportunity', 'Booked', 'Won'] },
        kpis: [
            { label: 'Active Pipeline', value: '₹ 142 Cr', color: 'blue' },
            { label: 'Exp. Closures (30d)', value: '₹ 28 Cr', color: 'green' },
            { label: 'Stuck Deals (30d+)', value: '₹ 12.5 Cr', color: 'red' },
            { label: 'Won (This Month)', value: '₹ 8.2 Cr', color: 'green' }
        ]
    },
    teamPerformance: {
        leaderboard: [
            { agent: 'Suraj', leads: 45, followups: 120, deals: 5, conversion: '11.1%', status: 'Top Performer' },
            { agent: 'Varun', leads: 38, followups: 95, deals: 3, conversion: '7.8%', status: 'Average' },
            { agent: 'Rajesh', leads: 22, followups: 40, deals: 1, conversion: '4.5%', status: 'Needs Attention' }
        ]
    },
    propertyInventory: {
        timeline: [
            { id: 1, item: 'Plot-1550', status: 'Sold', date: '2026-01-10', color: 'green' },
            { id: 2, item: 'Sector 4 Villa', status: 'Contract', date: '2026-01-15', color: 'purple' },
            { id: 3, item: 'Shop G-2', status: 'Offer', date: '2026-01-16', color: 'orange' }
        ],
        kpis: [
            { label: 'Active Listings', value: 42, color: 'blue' },
            { label: 'Offers Made', value: 8, color: 'orange' },
            { label: 'Contracts Sent', value: 4, color: 'purple' },
            { label: 'Sold (Last 30d)', value: 12, color: 'green' }
        ]
    },
    agenda: {
        tasks: [
            { id: 1, title: 'Follow-up Call', target: 'Amit Sharma', time: '10:30 AM', status: 'overdue' },
            { id: 2, title: 'Payment Reminder', target: 'Rohan Verma', time: '11:45 AM', status: 'due' }
        ],
        siteVisits: [{ id: 1, target: 'Sector 5 Plot', client: 'Suresh Raina', time: '04:00 PM' }],
        recentActivity: [{ id: 1, user: 'Suraj', action: 'Met', target: 'Karan Mehra', time: '09:00 AM' }]
    },
    communication: { avgDurationGauge: 72 }
};
