
import WhatsAppService from './WhatsAppService.js';
import Conversation from '../models/Conversation.js';
import Deal from '../models/Deal.js';
import NotificationEngine from './NotificationEngine.js';

/**
 * Deal Verification Service
 * Handles automated AI-driven verification of deals captured via intake.
 */
class DealVerificationService {
    /**
     * Triggers the verification workflow for a newly created deal.
     * @param {Object} deal - The Deal document
     * @param {Object} contactInfo - { mobile, name }
     */
    static async triggerVerification(deal, contactInfo) {
        const { mobile, name } = contactInfo;
        if (!mobile) return;

        try {
            // 1. Duplicate Check: Don't spam the same person for the SAME deal within 24 hours
            const recentlySent = await Deal.findOne({
                _id: deal._id,
                'verification_meta.lastSentAt': { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });

            if (recentlySent && deal.verificationStatus !== 'Pending') {
                console.log(`[DealVerification] Verification already in progress for Deal ${deal._id}. Skipping.`);
                return;
            }

            // 2. Identify if there are OTHER pending deals for this contact to verify together
            const otherPendingDeals = await Deal.find({
                'partyStructure.owner': deal.partyStructure.owner,
                _id: { $ne: deal._id },
                verificationStatus: 'Pending'
            }).limit(2);

            // 3. Prepare Template Components
            const contactName = name || 'Ji';
            const agentName = "Bharat Bot"; // Can be dynamic from owner if needed
            const projectNames = otherPendingDeals.length > 0 
                ? [deal.projectName, ...otherPendingDeals.map(d => d.projectName)].join(', ')
                : deal.projectName;

            const components = [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: contactName },
                        { type: 'text', text: agentName },
                        { type: 'text', text: projectNames }
                    ]
                }
            ];

            // 4. Send via Meta Template
            // Template Name: deal_intake_verification
            const sendResult = await WhatsAppService.sendTemplate(mobile, 'deal_intake_verification', 'en_US', components);

            // FALLBACK: If template fails (e.g. not approved yet), try raw message for existing 24h windows
            if (!sendResult.success) {
                console.warn(`[DealVerification] Template failed, attempting raw message fallback...`);
                const fallbackMsg = `Namaste ${contactName}! 😊\n\nI am ${agentName} from Bharat Properties. I noticed you shared details for *${projectNames}*. Is this correct?`;
                await WhatsAppService.sendMessage(mobile, fallbackMsg);
            }

            // 5. Update Deal Status
            await Deal.findByIdAndUpdate(deal._id, {
                verificationStatus: 'Pending',
                'verification_meta.lastSentAt': new Date(),
                'verification_meta.isProbeSent': true
            });

                // Update others if any
                if (otherPendingDeals.length > 0) {
                    await Deal.updateMany(
                        { _id: { $in: otherPendingDeals.map(d => d._id) } },
                        { 'verification_meta.lastSentAt': new Date() }
                    );
                }

                // 5. Update/Create Conversation State to 'intake_verification'
                await Conversation.findOneAndUpdate(
                    { phoneNumber: mobile.replace(/\D/g, ''), status: 'active' },
                    { 
                        $set: { 
                            lastMessageAt: new Date(),
                            currentUseCase: 'intake_verification' 
                        }
                    },
                    { upsert: true }
                );

                console.log(`[DealVerification] ✅ Probe sent to ${mobile} for Deal ${deal._id}`);
            }

        } catch (error) {
            console.error('[DealVerification] ❌ Error triggering verification:', error.message);
        }
    }
}

export default DealVerificationService;
