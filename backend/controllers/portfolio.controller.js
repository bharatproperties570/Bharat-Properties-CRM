import Portfolio from '../models/Portfolio.js';
import Lead from '../models/Lead.js';
import Inventory from '../models/Inventory.js';
import mongoose from 'mongoose';

/**
 * Creates a new shareable portfolio for a lead based on their pinned matches
 */
export const createPortfolio = async (req, res) => {
    try {
        const { leadId, itemIds, title } = req.body;

        if (!leadId || !itemIds || !Array.isArray(itemIds)) {
            return res.status(400).json({ success: false, message: "Lead ID and items are required" });
        }

        // Verify lead exists
        const lead = await Lead.findById(leadId).select('firstName lastName owner');
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        // Create Portfolio
        const portfolio = new Portfolio({
            leadId,
            agentId: req.user?._id || lead.owner,
            items: itemIds.map(id => ({ inventoryId: id })),
            title: title || `Property Portfolio for ${lead.firstName}`,
            branding: {
                agentName: req.user?.fullName || 'Property Expert',
                agentPhone: req.user?.mobile || ''
            }
        });

        await portfolio.save();

        res.status(201).json({
            success: true,
            message: "Portfolio generated successfully",
            data: {
                token: portfolio.token,
                shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:5174'}/p/${portfolio.token}`,
                id: portfolio._id
            }
        });
    } catch (error) {
        console.error("[CREATE_PORTFOLIO_ERROR]", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Publicly fetches portfolio details for the viewing page
 * (No authentication required)
 */
export const getPublicPortfolio = async (req, res) => {
    try {
        const { token } = req.params;
        
        const portfolio = await Portfolio.findOne({ token, isActive: true })
            .populate({
                path: 'items.inventoryId',
                select: 'projectName unitNo size sizeUnit price category address description propertyImages'
            })
            .populate('agentId', 'fullName mobile email profilePicture');

        if (!portfolio) {
            return res.status(404).json({ success: false, message: "Portfolio not found or expired" });
        }

        // Analytics: Track view (Asynchronous)
        portfolio.viewCount += 1;
        portfolio.lastViewedAt = new Date();
        portfolio.views.push({
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
        portfolio.save().catch(e => console.error("[VIEW_TRACK_ERROR]", e));

        res.json({
            success: true,
            data: {
                title: portfolio.title,
                items: portfolio.items.map(i => i.inventoryId).filter(Boolean),
                agent: portfolio.agentId,
                branding: portfolio.branding,
                createdAt: portfolio.createdAt
            }
        });
    } catch (error) {
        console.error("[GET_PUBLIC_PORTFOLIO_ERROR]", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
