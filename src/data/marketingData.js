// Marketing Campaign Data for Bharat Properties CRM
// Real Estate specific campaign tracking with ROI calculations

export const marketingData = {
    online: [
        {
            id: 1,
            name: "Google Plot Campaign - Sector 17",
            platform: "Google Ads",
            totalSpend: 45000,
            leadsGenerated: 87,
            qualifiedLeads: 52,
            siteVisits: 234,
            dealsClosed: 8,
            revenueGenerated: 2400000,
            status: "Running",
            propertyType: "Plot",
            budgetRange: "₹50L-₹1Cr",
            sector: "Sector 17",
            createdDate: "2025-12-15",
            // Auto-calculated fields
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        },
        {
            id: 2,
            name: "Facebook Flat Campaign - Urban Estate",
            platform: "Facebook",
            totalSpend: 32000,
            leadsGenerated: 124,
            qualifiedLeads: 68,
            siteVisits: 456,
            dealsClosed: 12,
            revenueGenerated: 4800000,
            status: "Running",
            propertyType: "Flat",
            budgetRange: "₹30L-₹50L",
            sector: "Urban Estate",
            createdDate: "2025-12-20",
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        },
        {
            id: 3,
            name: "Instagram Commercial Campaign",
            platform: "Instagram",
            totalSpend: 28000,
            leadsGenerated: 56,
            qualifiedLeads: 28,
            siteVisits: 189,
            dealsClosed: 4,
            revenueGenerated: 3200000,
            status: "Running",
            propertyType: "Commercial",
            budgetRange: "₹1Cr-₹2Cr",
            sector: "NH-1 Highway",
            createdDate: "2026-01-05",
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        },
        {
            id: 4,
            name: "LinkedIn Builder Floor Campaign",
            platform: "LinkedIn",
            totalSpend: 18000,
            leadsGenerated: 34,
            qualifiedLeads: 22,
            siteVisits: 98,
            dealsClosed: 3,
            revenueGenerated: 1800000,
            status: "Running",
            propertyType: "Builder Floor",
            budgetRange: "₹50L-₹1Cr",
            sector: "Sector 13",
            createdDate: "2026-01-10",
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        },
        {
            id: 5,
            name: "Google Premium Plot Campaign",
            platform: "Google Ads",
            totalSpend: 62000,
            leadsGenerated: 43,
            qualifiedLeads: 31,
            siteVisits: 167,
            dealsClosed: 6,
            revenueGenerated: 5400000,
            status: "Running",
            propertyType: "Plot",
            budgetRange: "₹1Cr-₹2Cr",
            sector: "Sector 3",
            createdDate: "2025-12-01",
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        },
        {
            id: 6,
            name: "Facebook Budget Plot - Thanesar",
            platform: "Facebook",
            totalSpend: 15000,
            leadsGenerated: 92,
            qualifiedLeads: 34,
            siteVisits: 287,
            dealsClosed: 5,
            revenueGenerated: 1200000,
            status: "Paused",
            propertyType: "Plot",
            budgetRange: "₹20L-₹30L",
            sector: "Thanesar",
            createdDate: "2026-01-12",
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        },
        {
            id: 7,
            name: "Google Flat Campaign - Ladwa Road",
            platform: "Google Ads",
            totalSpend: 38000,
            leadsGenerated: 78,
            qualifiedLeads: 45,
            siteVisits: 234,
            dealsClosed: 7,
            revenueGenerated: 2800000,
            status: "Running",
            propertyType: "Flat",
            budgetRange: "₹30L-₹50L",
            sector: "Ladwa Road",
            createdDate: "2025-12-28",
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        },
        {
            id: 8,
            name: "Instagram Luxury Flat Campaign",
            platform: "Instagram",
            totalSpend: 48000,
            leadsGenerated: 64,
            qualifiedLeads: 38,
            siteVisits: 198,
            dealsClosed: 5,
            revenueGenerated: 4200000,
            status: "Running",
            propertyType: "Flat",
            budgetRange: "₹50L-₹1Cr",
            sector: "Sector 7",
            createdDate: "2026-01-08",
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        },
        {
            id: 9,
            name: "Facebook Commercial Shop Campaign",
            platform: "Facebook",
            totalSpend: 52000,
            leadsGenerated: 48,
            qualifiedLeads: 29,
            siteVisits: 156,
            dealsClosed: 4,
            revenueGenerated: 3600000,
            status: "Running",
            propertyType: "Commercial",
            budgetRange: "₹50L-₹1Cr",
            sector: "Old Bus Stand",
            createdDate: "2026-01-15",
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        },
        {
            id: 10,
            name: "LinkedIn Corporate Office Campaign",
            platform: "LinkedIn",
            totalSpend: 72000,
            leadsGenerated: 28,
            qualifiedLeads: 18,
            siteVisits: 89,
            dealsClosed: 2,
            revenueGenerated: 8000000,
            status: "Testing",
            propertyType: "Commercial",
            budgetRange: "₹2Cr+",
            sector: "Pipli",
            createdDate: "2026-01-18",
            get costPerLead() { return Math.round(this.totalSpend / this.leadsGenerated); },
            get roi() { return (((this.revenueGenerated - this.totalSpend) / this.totalSpend) * 100).toFixed(2); }
        }
    ],

    offline: [
        {
            id: 1,
            name: "Highway Billboard - NH-1",
            type: "Billboard",
            trackingPhone: "+91-98765-43210",
            qrCode: "QR-NH1-2025",
            totalCost: 85000,
            incomingCalls: 234,
            walkIns: 45,
            siteVisits: 67,
            dealsClosed: 8,
            revenueGenerated: 3200000,
            status: "Active",
            propertyType: "Plot",
            budgetRange: "₹50L-₹1Cr",
            location: "NH-1 Near Pipli",
            createdDate: "2025-11-01",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); }
        },
        {
            id: 2,
            name: "SMS Campaign - Plot Buyers Database",
            type: "SMS",
            trackingPhone: "+91-98765-43211",
            qrCode: "SMS-PLOT-2025",
            totalCost: 12000,
            incomingCalls: 456,
            walkIns: 89,
            siteVisits: 123,
            dealsClosed: 15,
            revenueGenerated: 4500000,
            status: "Active",
            propertyType: "Plot",
            budgetRange: "₹30L-₹50L",
            location: "Kurukshetra District",
            createdDate: "2025-12-10",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); }
        },
        {
            id: 3,
            name: "Property Expo - Kurukshetra",
            type: "Event",
            trackingPhone: "+91-98765-43212",
            qrCode: "EXPO-KKR-JAN2026",
            totalCost: 125000,
            incomingCalls: 567,
            walkIns: 234,
            siteVisits: 189,
            dealsClosed: 22,
            revenueGenerated: 8900000,
            status: "Completed",
            propertyType: "Mixed",
            budgetRange: "All Ranges",
            location: "Hotel Neelkanth",
            createdDate: "2026-01-10",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); }
        },
        {
            id: 4,
            name: "Call Center Campaign - Flat Leads",
            type: "Call Center",
            trackingPhone: "+91-98765-43213",
            qrCode: "CALL-FLAT-2026",
            totalCost: 45000,
            incomingCalls: 892,
            walkIns: 156,
            siteVisits: 234,
            dealsClosed: 18,
            revenueGenerated: 5400000,
            status: "Active",
            propertyType: "Flat",
            budgetRange: "₹30L-₹50L",
            location: "Pan Kurukshetra",
            createdDate: "2026-01-05",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); }
        },
        {
            id: 5,
            name: "Newspaper Ad - Times of India",
            type: "Print Media",
            trackingPhone: "+91-98765-43214",
            qrCode: "TOI-JAN-2026",
            totalCost: 28000,
            incomingCalls: 345,
            walkIns: 67,
            siteVisits: 98,
            dealsClosed: 9,
            revenueGenerated: 2700000,
            status: "Active",
            propertyType: "Plot",
            budgetRange: "₹50L-₹1Cr",
            location: "Kurukshetra Edition",
            createdDate: "2026-01-15",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); }
        },
        {
            id: 6,
            name: "Radio Campaign - Big FM",
            type: "Radio",
            trackingPhone: "+91-98765-43215",
            qrCode: "BIGFM-KKR-2026",
            totalCost: 35000,
            incomingCalls: 567,
            walkIns: 89,
            siteVisits: 134,
            dealsClosed: 11,
            revenueGenerated: 3300000,
            status: "Active",
            propertyType: "Flat",
            budgetRange: "₹30L-₹50L",
            location: "Kurukshetra-Ambala Region",
            createdDate: "2025-12-20",
            get roi() { return (((this.revenueGenerated - this.totalCost) / this.totalCost) * 100).toFixed(2); }
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
            createdDate: "2025-11-01"
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
            createdDate: "2025-10-15"
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
            createdDate: "2025-12-01"
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
            createdDate: "2025-09-01"
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
            createdDate: "2026-01-10"
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
            createdDate: "2025-12-15"
        }
    ]
};

// AI Insights Generator
export const generateAIInsights = (onlineData, offlineData) => {
    const insights = [];

    // High CPL Warning
    onlineData.forEach(campaign => {
        if (campaign.costPerLead > 500) {
            insights.push({
                type: 'warning',
                severity: 'high',
                campaign: campaign.name,
                message: `High CPL Alert: ₹${campaign.costPerLead.toLocaleString('en-IN')} - Consider optimizing or pausing`,
                action: 'Review targeting and ad creative'
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
                action: 'Review lead quality and sales follow-up process'
            });
        }
    });

    // Best Performer
    const bestCampaign = [...onlineData].sort((a, b) => parseFloat(b.roi) - parseFloat(a.roi))[0];
    if (bestCampaign && parseFloat(bestCampaign.roi) > 100) {
        insights.push({
            type: 'success',
            severity: 'low',
            campaign: bestCampaign.name,
            message: `Best ROI: ${bestCampaign.roi}% - Scale budget by 30%`,
            action: 'Increase daily budget and expand targeting'
        });
    }

    // Budget Range Insight
    const plotCampaigns = onlineData.filter(c => c.propertyType === 'Plot');
    const avgPlotROI = plotCampaigns.reduce((sum, c) => sum + parseFloat(c.roi), 0) / plotCampaigns.length;
    if (avgPlotROI > 50) {
        insights.push({
            type: 'info',
            severity: 'medium',
            campaign: 'Property Type Analysis',
            message: `Plots showing strong performance (Avg ROI: ${avgPlotROI.toFixed(1)}%)`,
            action: 'Focus marketing efforts on plot inventory'
        });
    }

    return insights;
};

// Calculate Global KPIs
export const calculateGlobalKPIs = (onlineData, offlineData, organicData) => {
    const totalSpend = onlineData.reduce((sum, c) => sum + c.totalSpend, 0) +
        offlineData.reduce((sum, c) => sum + c.totalCost, 0);

    const totalLeads = onlineData.reduce((sum, c) => sum + c.leadsGenerated, 0) +
        offlineData.reduce((sum, c) => sum + c.walkIns, 0) +
        organicData.reduce((sum, c) => sum + c.leadsGenerated, 0);

    const totalSiteVisits = onlineData.reduce((sum, c) => sum + c.siteVisits, 0) +
        offlineData.reduce((sum, c) => sum + c.siteVisits, 0) +
        organicData.reduce((sum, c) => sum + c.siteVisits, 0);

    const totalDeals = onlineData.reduce((sum, c) => sum + c.dealsClosed, 0) +
        offlineData.reduce((sum, c) => sum + c.dealsClosed, 0);

    const totalRevenue = onlineData.reduce((sum, c) => sum + c.revenueGenerated, 0) +
        offlineData.reduce((sum, c) => sum + c.revenueGenerated, 0);

    const avgCPL = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0;
    const roi = totalSpend > 0 ? (((totalRevenue - totalSpend) / totalSpend) * 100).toFixed(2) : 0;

    return {
        totalSpend,
        totalLeads,
        avgCPL,
        totalSiteVisits,
        totalDeals,
        totalRevenue,
        roi
    };
};
