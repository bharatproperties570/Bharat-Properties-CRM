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

const resolveAbsoluteMediaUrl = (url, req) => {
    if (!url) return '';
    
    // 1. If it's a Google Drive link, convert it to a direct content/view link so it renders inside <img> / <video>
    const gDriveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (gDriveMatch && gDriveMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${gDriveMatch[1]}`;
    }
    
    // 2. If it's a relative local upload path, prepend the backend host dynamically
    if (url.startsWith('/uploads/')) {
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const host = req.get('host');
        return `${protocol}://${host}${url}`;
    }
    
    return url;
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
                select: 'projectName unitNo size sizeUnit price category address description inventoryImages inventoryVideos'
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

        const processedItems = portfolio.items.map(item => {
            const inv = item.inventoryId;
            if (!inv) return null;

            const rawImages = inv.inventoryImages || [];
            const rawVideos = inv.inventoryVideos || [];

            const resolvedImages = rawImages.map(img => {
                const url = typeof img === 'object' ? img.url : img;
                return resolveAbsoluteMediaUrl(url, req);
            }).filter(Boolean);

            const resolvedVideos = rawVideos.map(vid => {
                const url = typeof vid === 'object' ? vid.url : vid;
                return resolveAbsoluteMediaUrl(url, req);
            }).filter(Boolean);

            return {
                ...inv.toObject(),
                inventoryImages: resolvedImages,
                inventoryVideos: resolvedVideos,
                propertyImages: resolvedImages, // For backwards compatibility with PublicPortfolioPage.jsx
                propertyVideos: resolvedVideos  // For backwards compatibility
            };
        }).filter(Boolean);

        res.json({
            success: true,
            data: {
                title: portfolio.title,
                items: processedItems,
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
