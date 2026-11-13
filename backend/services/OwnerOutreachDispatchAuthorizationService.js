import mongoose from 'mongoose';
import Contact from '../models/Contact.js';
import OwnerOutreachCampaign from '../models/OwnerOutreachCampaign.js';
import OwnerOutreachRecipient from '../models/OwnerOutreachRecipient.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import WhatsAppAccountAuthorizationService from './WhatsAppAccountAuthorizationService.js';
import OwnerOutreachReservationService from './OwnerOutreachReservationService.js';
import { normalizePhone } from '../utils/normalization.js';
import { hashEndpoint } from '../utils/ownerOutreachAudience.js';

/**
 * Final authorization/reservation gate for a future Owner Outreach dispatcher.
 * This service does not call any provider or enqueue outbound work.
 * Unsupported channels fail closed until channel-specific consent fields exist.
 */
export default class OwnerOutreachDispatchAuthorizationService {
    constructor({
        contactModel = Contact,
        campaignModel = OwnerOutreachCampaign,
        recipientModel = OwnerOutreachRecipient,
        integrationModel = WhatsAppIntegration,
        accountAuthorization = WhatsAppAccountAuthorizationService,
        reservationService = new OwnerOutreachReservationService()
    } = {}) {
        this.Contact = contactModel;
        this.Campaign = campaignModel;
        this.Recipient = recipientModel;
        this.Integration = integrationModel;
        this.accountAuthorization = accountAuthorization;
        this.reservationService = reservationService;
    }

    async authorizeAndReserve({
        user, campaignId, recipientId, providerAccountId,
        bucketKey, periodKey, globalDailyCap, channelDailyCap
    } = {}) {
        const deny = (code) => ({ authorized: false, reserved: false, code, dispatchEnabled: false });
        if (!user?._id || !mongoose.Types.ObjectId.isValid(campaignId) ||
            !mongoose.Types.ObjectId.isValid(recipientId) || !providerAccountId) {
            return deny('INVALID_ACTOR_OR_TARGET');
        }

        const campaign = await this.Campaign.findOne({
            _id: campaignId,
            createdBy: user._id,
            status: { $in: ['APPROVED', 'ACTIVE'] }
        }).select('_id status channels channelStrategy').lean();
        if (!campaign) return deny('CAMPAIGN_NOT_RUNNABLE');
        if (!campaign.channels?.includes('whatsapp')) return deny('CHANNEL_NOT_IN_CAMPAIGN');

        const recipient = await this.Recipient.findOne({
            _id: recipientId,
            campaignId,
            channel: 'whatsapp',
            eligibility: 'ELIGIBLE',
            consentState: 'CONSENTED',
            dispatchState: 'PENDING'
        }).select('_id channel endpointHash contactIds dispatchState').lean();
        if (!recipient) return deny('RECIPIENT_NOT_ELIGIBLE_OR_NOT_PENDING');
        if (!Array.isArray(recipient.contactIds) || recipient.contactIds.length === 0) {
            return deny('CONTACT_PROVENANCE_MISSING');
        }

        // Current consent is read from live CRM Contact documents, not trusted
        // from the frozen campaign snapshot. Missing/merged/deleted contacts fail closed.
        const contacts = await this.Contact.find({
            _id: { $in: recipient.contactIds },
            isDeleted: { $ne: true },
            isMerged: { $ne: true }
        }).select('_id phones whatsappOptInAt whatsappOptOut whatsappOptOutAt').lean();
        if (contacts.length !== recipient.contactIds.length) return deny('CONTACT_PROVENANCE_STALE');

        let currentConsentedEndpointFound = false;
        for (const contact of contacts) {
            const optOutIsCurrent = contact.whatsappOptOut === true ||
                (contact.whatsappOptOutAt && (!contact.whatsappOptInAt || contact.whatsappOptOutAt >= contact.whatsappOptInAt));
            if (optOutIsCurrent) {
                return deny('RECIPIENT_OPTED_OUT');
            }
            const ownsEndpoint = (contact.phones || []).some((phone) => {
                const raw = phone && typeof phone === 'object' ? phone.number : phone;
                const normalized = normalizePhone(raw);
                if (!normalized) return false;
                try {
                    return hashEndpoint('whatsapp', normalized) === recipient.endpointHash;
                } catch {
                    return false;
                }
            });
            if (ownsEndpoint && contact.whatsappOptInAt instanceof Date) currentConsentedEndpointFound = true;
        }
        if (!currentConsentedEndpointFound) return deny('CURRENT_WHATSAPP_CONSENT_NOT_FOUND');

        // Provider/account must be live, fully onboarded, and authorized for this actor.
        const account = await this.Integration.findOne({
            _id: providerAccountId,
            status: 'ACTIVE'
        }).lean();
        if (!account) return deny('PROVIDER_NOT_CONNECTED');
        if (account.provider === 'BAILEYS') {
            if (account.connectionType !== 'QR_SCANNER' || account.onboardingStatus !== 'QR_LINKED') {
                return deny('BAILEYS_SESSION_NOT_LINKED');
            }
        } else if (account.provider === 'META') {
            if (!['NEW_API', 'COEXISTENCE'].includes(account.connectionType) ||
                account.onboardingStatus !== 'CONNECTED' ||
                account.subscriptionStatus !== 'SUBSCRIBED' ||
                !['SUBSCRIBED', 'VERIFIED'].includes(account.webhookStatus)) {
                return deny('META_ACCOUNT_NOT_FULLY_CONNECTED');
            }
        } else {
            return deny('PROVIDER_UNSUPPORTED');
        }

        const accountAccess = await this.accountAuthorization.assertCanSend(user, String(account._id));
        if (!accountAccess?.authorized) return deny('PROVIDER_ACCOUNT_ACCESS_DENIED');

        if (!bucketKey || !periodKey) return deny('QUOTA_BUCKET_UNAVAILABLE');
        const reservation = await this.reservationService.reserve({
            endpointHash: recipient.endpointHash,
            channel: 'whatsapp',
            periodKey,
            bucketKey,
            campaignId: campaign._id,
            recipientId: recipient._id,
            globalDailyCap,
            channelDailyCap
        });
        if (!reservation?.reserved) return deny(reservation?.code || 'QUOTA_RESERVATION_FAILED');

        return {
            authorized: true,
            reserved: true,
            code: 'DISPATCH_AUTHORIZED_RESERVED',
            campaignId: String(campaign._id),
            recipientId: String(recipient._id),
            provider: account.provider,
            connectionType: account.connectionType,
            reservationId: String(reservation.reservationId),
            dispatchEnabled: false
        };
    }
}
