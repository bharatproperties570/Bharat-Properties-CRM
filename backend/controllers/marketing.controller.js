import marketingService from '../services/MarketingService.js';
import Deal from '../models/Deal.js';
import Lead from '../models/Lead.js';
import NurtureBot from '../services/NurtureBot.js';

/**
 * Marketing Controller
 * Handles AI-driven marketing requests and analytics.
 */

/**
 * Get Marketing Dashboard Stats
 */
export const getMarketingStats = async (req, res) => {
    try {
        const stats = await NurtureBot.getMarketingStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get Historical Campaign Runs
 */
export const getCampaignRuns = async (req, res) => {
    try {
        // Mocking campaign history since we don't have a model yet, 
        // but returning it in the format the frontend expects.
        res.json({
            success: true,
            data: [
                { id: 1, name: 'Bandra Luxury Launch', date: '2024-03-20', reach: 15420, leads: 42, status: 'Completed' },
                { id: 2, name: 'Festive Offer SMS', date: '2024-03-15', reach: 4210, leads: 12, status: 'Completed' }
            ]
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Generate AI Social Content for a specific deal
 */
export const generateSocialContent = async (req, res) => {
    try {
        const { dealId, platform } = req.body;

        if (!dealId || !platform) {
            return res.status(400).json({ success: false, error: 'Deal ID and platform are required' });
        }

        const deal = await Deal.findById(dealId);
        if (!deal) {
            return res.status(404).json({ success: false, error: 'Deal not found' });
        }

        const content = await marketingService.generateSocialPost(deal, platform.toLowerCase());

        res.json({
            success: true,
            platform,
            content,
            dealTitle: deal.unitNo
        });
    } catch (error) {
        console.error('[MarketingController] generateSocialContent Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Generate AI Email Campaign
 */
export const generateEmailCampaign = async (req, res) => {
    try {
        const { dealId, audience } = req.body;

        const deal = await Deal.findById(dealId);
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        const campaign = await marketingService.generateEmailCampaign(deal, audience);

        res.json({
            success: true,
            campaign
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
/**
 * Get Recent Open Deals for Content Generation
 */
export const getRecentDeals = async (req, res) => {
    try {
        const deals = await Deal.find({ stage: 'Open' })
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({
            success: true,
            data: deals
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Run the AI Nurture Agent manually
 */
export const runMarketingAgent = async (req, res) => {
    try {
        const advancedCount = await NurtureBot.processPendingLeads();
        res.json({
            success: true,
            advancedCount,
            message: `AI Agent successfully processed and advanced ${advancedCount} leads.`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
