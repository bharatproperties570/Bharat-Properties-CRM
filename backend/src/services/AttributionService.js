import mongoose from 'mongoose';
import MarketingTouch from '../../models/MarketingTouch.js';
import MarketingDelivery from '../../models/MarketingDelivery.js';
import CampaignRun from '../../models/CampaignRun.js';

export const AttributionService = {
    /**
     * Resolves the deterministic Delivery and creates an immutable MarketingTouch
     * @param {string} recipientMobile - e.g. "919999999999"
     * @param {Date} eventTimestamp - Time the inbound event was received
     * @param {string} subjectId - The Lead or Deal ID
     * @param {string} subjectType - "Lead", "Contact", or "Deal"
     * @param {string} touchSource - e.g. "whatsapp_inbound"
     * @param {mongoose.ClientSession} [session] - Optional transactional session
     * @returns {Promise<mongoose.Types.ObjectId|null>} - The MarketingTouch ID if successful, else null
     */
    async attributeInboundEvent(recipientMobile, eventTimestamp, subjectId, subjectType, touchSource, session = null) {
        if (!recipientMobile || !subjectId) return null;
        
        // 1. Resolve deterministic delivery
        // 72 hour window
        const windowStart = new Date(eventTimestamp.getTime() - (72 * 60 * 60 * 1000));
        
        const delivery = await MarketingDelivery.findOne({
            recipientId: recipientMobile,
            status: 'SENT',
            lastAttemptAt: { $gte: windowStart }
        }).sort({ lastAttemptAt: -1, _id: -1 }).session(session).lean();

        if (!delivery || !delivery.campaignRunId) {
            return null; // Fallback
        }
        
        const run = await CampaignRun.findById(delivery.campaignRunId)
            .populate('campaignId', 'name type')
            .session(session).lean();
            
        if (!run || !run.campaignId) {
            return null; // Invalid reference fallback
        }
        
        // 2. Create MarketingTouch (Idempotent)
        const windowMatchedHrs = (eventTimestamp.getTime() - delivery.lastAttemptAt.getTime()) / (1000 * 60 * 60);
        
        try {
            const touch = new MarketingTouch({
                campaignId: run.campaignId._id,
                campaignRunId: run._id,
                deliveryId: delivery._id,
                subjectType,
                subjectId,
                touchSource,
                touchType: 'REPLY',
                timestamp: eventTimestamp,
                windowMatchedHrs,
                snapshot: {
                    campaignName: run.campaignId.name || 'Unknown',
                    channel: delivery.channel
                }
            });
            
            await touch.save({ session });
            return touch._id;
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate Touch handling (Idempotent NO-OP)
                const existing = await MarketingTouch.findOne({
                    deliveryId: delivery._id,
                    subjectId,
                    touchType: 'REPLY'
                }).session(session).lean();
                return existing ? existing._id : null;
            }
            throw err;
        }
    }
};
