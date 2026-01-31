// Enhanced Marketing Campaign Data for Bharat Properties CRM
// Professional-grade analytics with CAC, LTV, Performance Scoring, Budget Management

// Helper function to add calculated metrics to online campaigns
const addOnlineCampaignMetrics = (campaign) => ({
    ...campaign,
    get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
    get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); },
    get cac() { return this.dealsClosed > 0 ? Math.round(this.totalSpend / this.dealsClosed) : 0; },
    get ltv() { return Math.round(this.avgDealSize * (1 + (this.repeatCustomerRate || 0.15))); },
    get ltvCacRatio() { const ratio = this.ltv / this.cac; return ratio > 0 ? ratio.toFixed(2) : '0.00'; },
    get qualificationRate() { return ((this.qualifiedLeads / this.leadsGenerated) * 100).toFixed(1); },
    get conversionRate() { return ((this.dealsClosed / this.leadsGenerated) * 100).toFixed(1); },
    get budgetUtilization() { return ((this.totalSpend / this.budgetPlanned) * 100).toFixed(1); },
    get budgetVariance() { return this.budgetPlanned - this.totalSpend; },
    get performanceScore() {
        const roiScore = Math.min(Math.max(parseFloat(this.roi), 0) / 100 * 30, 30);
        const qualityScore = (this.avgLeadScore / 100) * 25;
        const conversionScore = Math.min((parseFloat(this.conversionRate) / 10) * 20, 20);
        const cplScore = Math.max(0, 15 - ((this.costPerLead - this.benchmarkCPL) / this.benchmarkCPL) * 15);
        const engagementScore = Math.min((this.siteVisits / this.leadsGenerated) * 10, 10);
        return Math.round(roiScore + qualityScore + conversionScore + cplScore + engagementScore);
    },
    get healthStatus() {
        const score = this.performanceScore;
        if (score >= 75) return { label: 'Excellent', color: '#10b981', bg: '#dcfce7' };
        if (score >= 60) return { label: 'Good', color: '#3b82f6', bg: '#dbeafe' };
        if (score >= 40) return { label: 'Average', color: '#f59e0b', bg: '#fef3c7' };
        return { label: 'Poor', color: '#ef4444', bg: '#fee2e2' };
    }
});

export const marketingData = {
    online: [
        addOnlineCampaignMetrics({
            id: 1,
            name: "Google Plot Campaign - Sector 17",
            platform: "Google Ads",
            totalSpend: 45000,
            budgetPlanned: 50000,
            budgetPeriod: "monthly",
            leadsGenerated: 87,
            qualifiedLeads: 52,
            mqlCount: 52,
            sqlCount: 34,
            avgLeadScore: 72,
            siteVisits: 234,
            dealsClosed: 8,
            revenueGenerated: 2400000,
            avgDealSize: 300000,
            repeatCustomerRate: 0.15,
            status: "Running",
            propertyType: "Plot",
            budgetRange: "₹50L-₹1Cr",
            sector: "Sector 17",
            createdDate: "2025-12-15",
            benchmarkCPL: 600,
            goalLeads: 90,
            goalRevenue: 2500000,
            // Property-level performance tracking
            propertyPerformance: [
                { propertyId: "PLOT-S17-045", propertyName: "Sector 17, Plot #45 (500 sq yd)", leadsGenerated: 28, siteVisits: 87, dealsClosed: 3, revenue: 900000 },
                { propertyId: "PLOT-S17-046", propertyName: "Sector 17, Plot #46 (300 sq yd)", leadsGenerated: 22, siteVisits: 68, dealsClosed: 2, revenue: 600000 },
                { propertyId: "PLOT-S17-047", propertyName: "Sector 17, Plot #47 (400 sq yd)", leadsGenerated: 19, siteVisits: 45, dealsClosed: 2, revenue: 700000 },
                { propertyId: "PLOT-S17-048", propertyName: "Sector 17, Plot #48 (250 sq yd)", leadsGenerated: 18, siteVisits: 34, dealsClosed: 1, revenue: 200000 }
            ],
            // Sector-wise insights
            topPerformingSector: "Sector 17",
            competitorActivity: "Medium",
            seasonalTrend: "Peak season (Jan-Mar)"
        }),
        addOnlineCampaignMetrics({
            id: 2,
            name: "Facebook Flat Campaign - Urban Estate",
            platform: "Facebook",
            totalSpend: 32000,
            budgetPlanned: 35000,
            budgetPeriod: "monthly",
            leadsGenerated: 124,
            qualifiedLeads: 68,
            mqlCount: 68,
            sqlCount: 45,
            avgLeadScore: 68,
            siteVisits: 456,
            dealsClosed: 12,
            revenueGenerated: 4800000,
            avgDealSize: 400000,
            repeatCustomerRate: 0.12,
            status: "Running",
            propertyType: "Flat",
            budgetRange: "₹30L-₹50L",
            sector: "Urban Estate",
            createdDate: "2025-12-20",
            benchmarkCPL: 300,
            goalLeads: 130,
            goalRevenue: 5000000,
            propertyPerformance: [
                { propertyId: "FLAT-UE-12A", propertyName: "Urban Estate Tower A, 2BHK #12A", leadsGenerated: 31, siteVisits: 112, dealsClosed: 3, revenue: 1200000 },
                { propertyId: "FLAT-UE-15B", propertyName: "Urban Estate Tower B, 3BHK #15B", leadsGenerated: 28, siteVisits: 98, dealsClosed: 3, revenue: 1500000 },
                { propertyId: "FLAT-UE-18C", propertyName: "Urban Estate Tower C, 2BHK #18C", leadsGenerated: 35, siteVisits: 134, dealsClosed: 4, revenue: 1600000 },
                { propertyId: "FLAT-UE-22D", propertyName: "Urban Estate Tower D, 3BHK #22D", leadsGenerated: 30, siteVisits: 112, dealsClosed: 2, revenue: 500000 }
            ],
            topPerformingSector: "Urban Estate",
            competitorActivity: "High",
            seasonalTrend: "Steady demand"
        }),
        addOnlineCampaignMetrics({
            id: 3,
            name: "Instagram Commercial Campaign",
            platform: "Instagram",
            totalSpend: 28000,
            budgetPlanned: 30000,
            budgetPeriod: "monthly",
            leadsGenerated: 56,
            qualifiedLeads: 28,
            mqlCount: 28,
            sqlCount: 18,
            avgLeadScore: 65,
            siteVisits: 189,
            dealsClosed: 4,
            revenueGenerated: 3200000,
            avgDealSize: 800000,
            repeatCustomerRate: 0.10,
            status: "Running",
            propertyType: "Commercial",
            budgetRange: "₹1Cr-₹2Cr",
            sector: "NH-1 Highway",
            createdDate: "2026-01-05",
            benchmarkCPL: 550,
            goalLeads: 60,
            goalRevenue: 3500000
        }),
        addOnlineCampaignMetrics({
            id: 4,
            name: "LinkedIn Builder Floor Campaign",
            platform: "LinkedIn",
            totalSpend: 18000,
            budgetPlanned: 20000,
            budgetPeriod: "monthly",
            leadsGenerated: 34,
            qualifiedLeads: 22,
            mqlCount: 22,
            sqlCount: 16,
            avgLeadScore: 78,
            siteVisits: 98,
            dealsClosed: 3,
            revenueGenerated: 1800000,
            avgDealSize: 600000,
            repeatCustomerRate: 0.18,
            status: "Running",
            propertyType: "Builder Floor",
            budgetRange: "₹50L-₹1Cr",
            sector: "Sector 13",
            createdDate: "2026-01-10",
            benchmarkCPL: 600,
            goalLeads: 40,
            goalRevenue: 2000000
        }),
        addOnlineCampaignMetrics({
            id: 5,
            name: "Google Premium Plot Campaign",
            platform: "Google Ads",
            totalSpend: 62000,
            budgetPlanned: 65000,
            budgetPeriod: "monthly",
            leadsGenerated: 43,
            qualifiedLeads: 31,
            mqlCount: 31,
            sqlCount: 24,
            avgLeadScore: 85,
            siteVisits: 167,
            dealsClosed: 6,
            revenueGenerated: 5400000,
            avgDealSize: 900000,
            repeatCustomerRate: 0.20,
            status: "Running",
            propertyType: "Plot",
            budgetRange: "₹1Cr-₹2Cr",
            sector: "Sector 3",
            createdDate: "2025-12-01",
            benchmarkCPL: 1500,
            goalLeads: 45,
            goalRevenue: 5500000
        }),
        addOnlineCampaignMetrics({
            id: 6,
            name: "Facebook Budget Plot - Thanesar",
            platform: "Facebook",
            totalSpend: 15000,
            budgetPlanned: 18000,
            budgetPeriod: "monthly",
            leadsGenerated: 92,
            qualifiedLeads: 34,
            mqlCount: 34,
            sqlCount: 18,
            avgLeadScore: 58,
            siteVisits: 287,
            dealsClosed: 5,
            revenueGenerated: 1200000,
            avgDealSize: 240000,
            repeatCustomerRate: 0.08,
            status: "Paused",
            propertyType: "Plot",
            budgetRange: "₹20L-₹30L",
            sector: "Thanesar",
            createdDate: "2026-01-12",
            benchmarkCPL: 200,
            goalLeads: 100,
            goalRevenue: 1500000
        }),
        addOnlineCampaignMetrics({
            id: 7,
            name: "Google Flat Campaign - Ladwa Road",
            platform: "Google Ads",
            totalSpend: 38000,
            budgetPlanned: 40000,
            budgetPeriod: "monthly",
            leadsGenerated: 78,
            qualifiedLeads: 45,
            mqlCount: 45,
            sqlCount: 28,
            avgLeadScore: 70,
            siteVisits: 234,
            dealsClosed: 7,
            revenueGenerated: 2800000,
            avgDealSize: 400000,
            repeatCustomerRate: 0.14,
            status: "Running",
            propertyType: "Flat",
            budgetRange: "₹30L-₹50L",
            sector: "Ladwa Road",
            createdDate: "2025-12-28",
            benchmarkCPL: 520,
            goalLeads: 80,
            goalRevenue: 3000000
        }),
        addOnlineCampaignMetrics({
            id: 8,
            name: "Instagram Luxury Flat Campaign",
            platform: "Instagram",
            totalSpend: 48000,
            budgetPlanned: 50000,
            budgetPeriod: "monthly",
            leadsGenerated: 64,
            qualifiedLeads: 38,
            mqlCount: 38,
            sqlCount: 25,
            avgLeadScore: 76,
            siteVisits: 198,
            dealsClosed: 5,
            revenueGenerated: 4200000,
            avgDealSize: 840000,
            repeatCustomerRate: 0.16,
            status: "Running",
            propertyType: "Flat",
            budgetRange: "₹50L-₹1Cr",
            sector: "Sector 7",
            createdDate: "2026-01-08",
            benchmarkCPL: 800,
            goalLeads: 70,
            goalRevenue: 4500000
        }),
        addOnlineCampaignMetrics({
            id: 9,
            name: "Facebook Commercial Shop Campaign",
            platform: "Facebook",
            totalSpend: 52000,
            budgetPlanned: 55000,
            budgetPeriod: "monthly",
            leadsGenerated: 48,
            qualifiedLeads: 29,
            mqlCount: 29,
            sqlCount: 20,
            avgLeadScore: 71,
            siteVisits: 156,
            dealsClosed: 4,
            revenueGenerated: 3600000,
            avgDealSize: 900000,
            repeatCustomerRate: 0.11,
            status: "Running",
            propertyType: "Commercial",
            budgetRange: "₹50L-₹1Cr",
            sector: "Old Bus Stand",
            createdDate: "2026-01-15",
            benchmarkCPL: 1100,
            goalLeads: 50,
            goalRevenue: 4000000
        }),
        addOnlineCampaignMetrics({
            id: 10,
            name: "LinkedIn Corporate Office Campaign",
            platform: "LinkedIn",
            totalSpend: 72000,
            budgetPlanned: 75000,
            budgetPeriod: "monthly",
            leadsGenerated: 28,
            qualifiedLeads: 18,
            mqlCount: 18,
            sqlCount: 14,
            avgLeadScore: 88,
            siteVisits: 89,
            dealsClosed: 2,
            revenueGenerated: 8000000,
            avgDealSize: 4000000,
            repeatCustomerRate: 0.25,
            status: "Testing",
            propertyType: "Commercial",
            budgetRange: "₹2Cr+",
            sector: "Pipli",
            createdDate: "2026-01-18",
            benchmarkCPL: 2800,
            goalLeads: 30,
            goalRevenue: 10000000
        })
    ],

    offline: [
        {
            id: 1,
            name: "Highway Billboard - NH-1",
            type: "Billboard",
            trackingPhone: "+91-98765-43210",
            qrCode: "QR-NH1-2025",
            totalCost: 85000,
            budgetPlanned: 90000,
            incomingCalls: 234,
            walkIns: 45,
            siteVisits: 67,
            dealsClosed: 8,
            revenueGenerated: 3200000,
            avgDealSize: 400000,
            status: "Active",
            propertyType: "Plot",
            budgetRange: "₹50L-₹1Cr",
            location: "NH-1 Near Pipli",
            createdDate: "2025-11-01",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); },
            get cac() { return this.dealsClosed > 0 ? Math.round(this.totalCost / this.dealsClosed) : 0; },
            get conversionRate() { return ((this.dealsClosed / this.walkIns) * 100).toFixed(1); }
        },
        {
            id: 2,
            name: "SMS Campaign - Plot Buyers Database",
            type: "SMS",
            trackingPhone: "+91-98765-43211",
            qrCode: "SMS-PLOT-2025",
            totalCost: 12000,
            budgetPlanned: 15000,
            incomingCalls: 456,
            walkIns: 89,
            siteVisits: 123,
            dealsClosed: 15,
            revenueGenerated: 4500000,
            avgDealSize: 300000,
            status: "Active",
            propertyType: "Plot",
            budgetRange: "₹30L-₹50L",
            location: "Kurukshetra District",
            createdDate: "2025-12-10",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); },
            get cac() { return this.dealsClosed > 0 ? Math.round(this.totalCost / this.dealsClosed) : 0; },
            get conversionRate() { return ((this.dealsClosed / this.walkIns) * 100).toFixed(1); }
        },
        {
            id: 3,
            name: "Property Expo - Kurukshetra",
            type: "Event",
            trackingPhone: "+91-98765-43212",
            qrCode: "EXPO-KKR-JAN2026",
            totalCost: 125000,
            budgetPlanned: 130000,
            incomingCalls: 567,
            walkIns: 234,
            siteVisits: 189,
            dealsClosed: 22,
            revenueGenerated: 8900000,
            avgDealSize: 404545,
            status: "Completed",
            propertyType: "Mixed",
            budgetRange: "All Ranges",
            location: "Hotel Neelkanth",
            createdDate: "2026-01-10",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); },
            get cac() { return this.dealsClosed > 0 ? Math.round(this.totalCost / this.dealsClosed) : 0; },
            get conversionRate() { return ((this.dealsClosed / this.walkIns) * 100).toFixed(1); }
        },
        {
            id: 4,
            name: "Call Center Campaign - Flat Leads",
            type: "Call Center",
            trackingPhone: "+91-98765-43213",
            qrCode: "CALL-FLAT-2026",
            totalCost: 45000,
            budgetPlanned: 50000,
            incomingCalls: 892,
            walkIns: 156,
            siteVisits: 234,
            dealsClosed: 18,
            revenueGenerated: 5400000,
            avgDealSize: 300000,
            status: "Active",
            propertyType: "Flat",
            budgetRange: "₹30L-₹50L",
            location: "Pan Kurukshetra",
            createdDate: "2026-01-05",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); },
            get cac() { return this.dealsClosed > 0 ? Math.round(this.totalCost / this.dealsClosed) : 0; },
            get conversionRate() { return ((this.dealsClosed / this.walkIns) * 100).toFixed(1); }
        },
        {
            id: 5,
            name: "Newspaper Ad - Times of India",
            type: "Print Media",
            trackingPhone: "+91-98765-43214",
            qrCode: "TOI-JAN-2026",
            totalCost: 28000,
            budgetPlanned: 30000,
            incomingCalls: 345,
            walkIns: 67,
            siteVisits: 98,
            dealsClosed: 9,
            revenueGenerated: 2700000,
            avgDealSize: 300000,
            status: "Active",
            propertyType: "Plot",
            budgetRange: "₹50L-₹1Cr",
            location: "Kurukshetra Edition",
            createdDate: "2026-01-15",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); },
            get cac() { return this.dealsClosed > 0 ? Math.round(this.totalCost / this.dealsClosed) : 0; },
            get conversionRate() { return ((this.dealsClosed / this.walkIns) * 100).toFixed(1); }
        },
        {
            id: 6,
            name: "Radio Campaign - Big FM",
            type: "Radio",
            trackingPhone: "+91-98765-43215",
            qrCode: "BIGFM-KKR-2026",
            totalCost: 35000,
            budgetPlanned: 38000,
            incomingCalls: 567,
            walkIns: 89,
            siteVisits: 134,
            dealsClosed: 11,
            revenueGenerated: 3300000,
            avgDealSize: 300000,
            status: "Active",
            propertyType: "Flat",
            budgetRange: "₹30L-₹50L",
            location: "Kurukshetra-Ambala Region",
            createdDate: "2025-12-20",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); },
            get cac() { return this.dealsClosed > 0 ? Math.round(this.totalCost / this.dealsClosed) : 0; },
            get conversionRate() { return ((this.dealsClosed / this.walkIns) * 100).toFixed(1); }
        }
    ],

    organic: [
        {
            id: 1,
            name: "Weekly Newsletter - Property Updates",
            source: "Email",
            views: 4500,
            clicks: 890,
            leadsGenerated: 123,
            siteVisits: 567,
            assistedDeals: 8,
            propertyType: "Mixed",
            createdDate: "2025-11-01",
            get clickThroughRate() { return ((this.clicks / this.views) * 100).toFixed(2); },
            get leadConversionRate() { return ((this.leadsGenerated / this.clicks) * 100).toFixed(2); }
        },
        {
            id: 2,
            name: "YouTube Channel - Property Tours",
            source: "YouTube",
            views: 12500,
            clicks: 2340,
            leadsGenerated: 234,
            siteVisits: 1234,
            assistedDeals: 15,
            propertyType: "Mixed",
            createdDate: "2025-10-15",
            get clickThroughRate() { return ((this.clicks / this.views) * 100).toFixed(2); },
            get leadConversionRate() { return ((this.leadsGenerated / this.clicks) * 100).toFixed(2); }
        },
        {
            id: 3,
            name: "Blog - Real Estate Investment Tips",
            source: "Website Blog",
            views: 8900,
            clicks: 1567,
            leadsGenerated: 178,
            siteVisits: 892,
            assistedDeals: 12,
            propertyType: "Mixed",
            createdDate: "2025-12-01",
            get clickThroughRate() { return ((this.clicks / this.views) * 100).toFixed(2); },
            get leadConversionRate() { return ((this.leadsGenerated / this.clicks) * 100).toFixed(2); }
        },
        {
            id: 4,
            name: "Website SEO - Plot Listings",
            source: "Organic Search",
            views: 15600,
            clicks: 3456,
            leadsGenerated: 456,
            siteVisits: 2345,
            assistedDeals: 28,
            propertyType: "Plot",
            createdDate: "2025-09-01",
            get clickThroughRate() { return ((this.clicks / this.views) * 100).toFixed(2); },
            get leadConversionRate() { return ((this.leadsGenerated / this.clicks) * 100).toFixed(2); }
        },
        {
            id: 5,
            name: "WhatsApp Status - New Projects",
            source: "WhatsApp",
            views: 3400,
            clicks: 678,
            leadsGenerated: 89,
            siteVisits: 345,
            assistedDeals: 6,
            propertyType: "Mixed",
            createdDate: "2026-01-10",
            get clickThroughRate() { return ((this.clicks / this.views) * 100).toFixed(2); },
            get leadConversionRate() { return ((this.leadsGenerated / this.clicks) * 100).toFixed(2); }
        },
        {
            id: 6,
            name: "Instagram Reels - Property Tips",
            source: "Instagram Organic",
            views: 8900,
            clicks: 1234,
            leadsGenerated: 145,
            siteVisits: 678,
            assistedDeals: 9,
            propertyType: "Mixed",
            createdDate: "2025-12-15",
            get clickThroughRate() { return ((this.clicks / this.views) * 100).toFixed(2); },
            get leadConversionRate() { return ((this.leadsGenerated / this.clicks) * 100).toFixed(2); }
        }
    ]
};

// Enhanced AI Insights Generator with advanced analysis
export const generateAIInsights = (onlineData, offlineData) => {
    const insights = [];

    // Performance Score Analysis
    onlineData.forEach(campaign => {
        const score = campaign.performanceScore;
        if (score < 40) {
            insights.push({
                type: 'critical',
                severity: 'critical',
                campaign: campaign.name,
                message: `Low Performance Score: ${score}/100 - Campaign needs immediate attention`,
                action: 'Review all metrics and consider pausing or major optimization'
            });
        } else if (score >= 75) {
            insights.push({
                type: 'success',
                severity: 'low',
                campaign: campaign.name,
                message: `Excellent Performance: ${score}/100 - Top performer!`,
                action: 'Scale budget by 30-50% to maximize returns'
            });
        }
    });

    // LTV:CAC Ratio Analysis
    onlineData.forEach(campaign => {
        const ratio = parseFloat(campaign.ltvCacRatio);
        if (ratio < 3 && ratio > 0) {
            insights.push({
                type: 'warning',
                severity: 'high',
                campaign: campaign.name,
                message: `LTV:CAC Ratio is ${ratio}:1 (recommended >3:1) - Profitability concern`,
                action: 'Improve lead quality or reduce acquisition costs'
            });
        }
    });

    // Budget Variance Alerts
    onlineData.forEach(campaign => {
        const utilization = parseFloat(campaign.budgetUtilization);
        if (utilization > 95) {
            insights.push({
                type: 'warning',
                severity: 'medium',
                campaign: campaign.name,
                message: `Budget ${utilization}% utilized - Risk of overspend`,
                action: 'Request budget increase or pace spending'
            });
        }
    });

    // Lead Quality Insights
    onlineData.forEach(campaign => {
        const qualRate = parseFloat(campaign.qualificationRate);
        if (qualRate < 40) {
            insights.push({
                type: 'warning',
                severity: 'high',
                campaign: campaign.name,
                message: `Only ${qualRate}% leads are qualified - Quality issue detected`,
                action: 'Refine targeting or review lead scoring criteria'
            });
        }
    });

    // High CPL Warning
    onlineData.forEach(campaign => {
        if (campaign.costPerLead > campaign.benchmarkCPL * 1.5) {
            insights.push({
                type: 'warning',
                severity: 'high',
                campaign: campaign.name,
                message: `CPL ₹${campaign.costPerLead.toLocaleString('en-IN')} is 50% above benchmark`,
                action: 'Optimize ad creative, targeting, or landing pages'
            });
        }
    });

    // Zero Conversion Alert
    onlineData.forEach(campaign => {
        if (campaign.dealsClosed === 0 && campaign.leadsGenerated > 20) {
            insights.push({
                type: 'critical',
                severity: 'critical',
                campaign: campaign.name,
                message: `Zero conversions despite ${campaign.leadsGenerated} leads generated`,
                action: 'Review sales process and lead nurturing workflow'
            });
        }
    });

    // Best Performer - CAC Efficiency
    const bestCAC = [...onlineData].filter(c => c.cac > 0).sort((a, b) => a.cac - b.cac)[0];
    if (bestCAC) {
        insights.push({
            type: 'success',
            severity: 'low',
            campaign: bestCAC.name,
            message: `Lowest CAC: ₹${bestCAC.cac.toLocaleString('en-IN')} - Most efficient acquisition`,
            action: 'Analyze and replicate success factors to other campaigns'
        });
    }

    // Property Type Performance
    const plotCampaigns = onlineData.filter(c => c.propertyType === 'Plot');
    if (plotCampaigns.length > 0) {
        const avgPlotROI = plotCampaigns.reduce((sum, c) => sum + parseFloat(c.roi), 0) / plotCampaigns.length;
        if (avgPlotROI > 50) {
            insights.push({
                type: 'info',
                severity: 'medium',
                campaign: 'Property Category Analysis',
                message: `Plot campaigns averaging ${avgPlotROI.toFixed(1)}% ROI - Strong performance`,
                action: 'Increase budget allocation to Plot category'
            });
        }
    }

    return insights.slice(0, 8); // Return top 8 insights
};

// Enhanced Global KPIs with Financial Metrics
export const calculateGlobalKPIs = (onlineData, offlineData, organicData) => {
    const totalSpend = onlineData.reduce((sum, c) => sum + c.totalSpend, 0) +
        offlineData.reduce((sum, c) => sum + c.totalCost, 0);

    const totalBudgetPlanned = onlineData.reduce((sum, c) => sum + c.budgetPlanned, 0) +
        offlineData.reduce((sum, c) => sum + c.budgetPlanned, 0);

    const totalLeads = onlineData.reduce((sum, c) => sum + c.leadsGenerated, 0) +
        offlineData.reduce((sum, c) => sum + c.walkIns, 0) +
        organicData.reduce((sum, c) => sum + c.leadsGenerated, 0);

    const totalMQL = onlineData.reduce((sum, c) => sum + (c.mqlCount || 0), 0);
    const totalSQL = onlineData.reduce((sum, c) => sum + (c.sqlCount || 0), 0);

    const totalSiteVisits = onlineData.reduce((sum, c) => sum + c.siteVisits, 0) +
        offlineData.reduce((sum, c) => sum + c.siteVisits, 0) +
        organicData.reduce((sum, c) => sum + c.siteVisits, 0);

    const totalDeals = onlineData.reduce((sum, c) => sum + c.dealsClosed, 0) +
        offlineData.reduce((sum, c) => sum + c.dealsClosed, 0);

    const totalRevenue = onlineData.reduce((sum, c) => sum + c.revenueGenerated, 0) +
        offlineData.reduce((sum, c) => sum + c.revenueGenerated, 0);

    const avgCPL = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0;
    const roi = totalSpend > 0 ? (((totalRevenue - totalSpend) / totalSpend) * 100).toFixed(2) : 0;
    const globalCAC = totalDeals > 0 ? Math.round(totalSpend / totalDeals) : 0;
    const avgDealSize = totalDeals > 0 ? Math.round(totalRevenue / totalDeals) : 0;
    const globalLTV = Math.round(avgDealSize * 1.15); // Assuming 15% repeat rate
    const ltvCacRatio = globalCAC > 0 ? (globalLTV / globalCAC).toFixed(2) : '0.00';
    const budgetUtilization = totalBudgetPlanned > 0 ? ((totalSpend / totalBudgetPlanned) * 100).toFixed(1) : '0.0';
    const conversionRate = totalLeads > 0 ? ((totalDeals / totalLeads) * 100).toFixed(2) : '0.00';

    return {
        totalSpend,
        totalBudgetPlanned,
        budgetUtilization,
        budgetRemaining: totalBudgetPlanned - totalSpend,
        totalLeads,
        totalMQL,
        totalSQL,
        avgCPL,
        totalSiteVisits,
        totalDeals,
        totalRevenue,
        roi,
        globalCAC,
        globalLTV,
        ltvCacRatio,
        avgDealSize,
        conversionRate
    };
};
