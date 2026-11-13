import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import OwnerOutreachCampaign from '../models/OwnerOutreachCampaign.js';
import OwnerOutreachRecipient from '../models/OwnerOutreachRecipient.js';
import { getVisibilityFilter } from '../utils/visibility.js';
import { buildOwnerOutreachAudience, OWNER_OUTREACH_BATCH_SIZES, OWNER_OUTREACH_FREQUENCIES } from '../utils/ownerOutreachAudience.js';

const MAX_INVENTORY_SNAPSHOT = 10000;
const allowedChannels = new Set(['whatsapp', 'sms', 'rcs', 'email']);

function validateCampaignConfig(input = {}) {
    if (!input.name || typeof input.name !== 'string' || !input.name.trim()) throw new Error('Campaign name is required');
    if (!OWNER_OUTREACH_FREQUENCIES.includes(input.frequency)) throw new Error('Invalid campaign frequency');
    if (!OWNER_OUTREACH_BATCH_SIZES.includes(Number(input.batchSize))) throw new Error('Invalid batch size');
    if (!Array.isArray(input.channels) || input.channels.length === 0 || input.channels.some((c) => !allowedChannels.has(c))) throw new Error('Select at least one supported channel');
    if (!['PRIMARY_ONLY', 'PRIMARY_WITH_FALLBACK', 'SEQUENCE'].includes(input.channelStrategy || 'PRIMARY_ONLY')) throw new Error('Invalid channel strategy');
    const startAt = new Date(input.startAt);
    if (!Number.isFinite(startAt.getTime())) throw new Error('A valid campaign start date/time is required');
    if (input.endAt && new Date(input.endAt) < startAt) throw new Error('Campaign end date must be after start date');
    return { startAt, endAt: input.endAt ? new Date(input.endAt) : null };
}

export default class OwnerOutreachService {
    async resolveAudience(input = {}, user) {
        const visibility = user ? await getVisibilityFilter(user) : {};
        const query = { ...visibility, isDeleted: { $ne: true }, isMerged: { $ne: true } };
        const inventoryIds = Array.isArray(input.inventoryIds) ? input.inventoryIds : [];
        if (inventoryIds.length) {
            if (inventoryIds.length > MAX_INVENTORY_SNAPSHOT || inventoryIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
                throw new Error('Invalid inventory selection');
            }
            query._id = { $in: inventoryIds.map((id) => new mongoose.Types.ObjectId(id)) };
        }
        const filters = input.filters || {};
        if (filters.project && filters.project !== 'all') {
            const escaped = String(filters.project).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [{ projectName: new RegExp(escaped, 'i') }, { sector: new RegExp(escaped, 'i') }];
        }
        if (filters.category && mongoose.Types.ObjectId.isValid(filters.category)) query.category = new mongoose.Types.ObjectId(filters.category);
        if (filters.status && mongoose.Types.ObjectId.isValid(filters.status)) query.status = new mongoose.Types.ObjectId(filters.status);

        const inventory = await Inventory.find(query)
            .select('_id projectName unitNo unitNumber sector owners associates')
            .populate({ path: 'owners', select: '_id name surname phones emails professionCategory professionSubCategory designation tags whatsappOptOut whatsappOptInAt' })
            .populate({ path: 'associates.contact', select: '_id name surname phones emails professionCategory professionSubCategory designation tags whatsappOptOut whatsappOptInAt' })
            .limit(MAX_INVENTORY_SNAPSHOT + 1)
            .lean();
        if (inventory.length > MAX_INVENTORY_SNAPSHOT) throw new Error('Audience exceeds the 10,000 inventory snapshot limit; narrow the inventory filters');
        const audience = buildOwnerOutreachAudience(inventory, {
            includeOwners: input.includeOwners !== false,
            includeAssociates: input.includeAssociates === true,
            excludeBrokers: input.excludeBrokers !== false
        });
        return { ...audience, inventoryCount: inventory.length };
    }

    async preview(input, user) {
        const audience = await this.resolveAudience(input, user);
        const counts = {
            uniquePeople: audience.uniquePeople,
            uniqueEndpoints: audience.endpoints.length,
            byChannel: {},
            consentRequired: audience.endpoints.filter((x) => x.eligibility === 'CONSENT_REQUIRED').length,
            suppressed: audience.endpoints.filter((x) => x.eligibility === 'SUPPRESSED_OPTOUT').length
        };
        for (const endpoint of audience.endpoints) {
            counts.byChannel[endpoint.channel] = (counts.byChannel[endpoint.channel] || 0) + 1;
        }
        return { inventoryCount: audience.inventoryCount, counts, endpoints: audience.endpoints.map(({ channel, maskedEndpoint, eligibility, inventoryIds, relationships }) => ({ channel, maskedEndpoint, eligibility, inventoryCount: inventoryIds.length, relationships })) };
    }

    async createDraft(input, user) {
        const { startAt, endAt } = validateCampaignConfig(input);
        const audience = await this.resolveAudience(input.audience || input, user);
        if (!audience.endpoints.length) throw new Error('No valid owner or associate contact endpoints found');
        const campaign = await OwnerOutreachCampaign.create({
            name: input.name.trim(),
            createdBy: user._id,
            status: 'DRAFT',
            audience: {
                inventoryIds: (input.audience?.inventoryIds || input.inventoryIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id)),
                filters: input.audience?.filters || input.filters || {},
                includeOwners: (input.audience || input).includeOwners !== false,
                includeAssociates: (input.audience || input).includeAssociates === true,
                excludeBrokers: (input.audience || input).excludeBrokers !== false,
                frozenAt: new Date()
            },
            channels: input.channels,
            channelStrategy: input.channelStrategy || 'PRIMARY_ONLY',
            frequency: input.frequency,
            batchSize: Number(input.batchSize),
            startAt,
            endAt,
            timezone: 'Asia/Kolkata',
            dispatchWindow: input.dispatchWindow || { start: '10:00', end: '18:00' },
            totals: {
                uniquePeople: audience.uniquePeople,
                uniqueEndpoints: audience.endpoints.length,
                recipients: audience.endpoints.length,
                consentRequired: audience.endpoints.filter((x) => x.eligibility === 'CONSENT_REQUIRED').length,
                suppressed: audience.endpoints.filter((x) => x.eligibility === 'SUPPRESSED_OPTOUT').length
            }
        });

        try {
            const docs = audience.endpoints.map((endpoint) => ({
                campaignId: campaign._id,
                channel: endpoint.channel,
                endpointHash: endpoint.endpointHash,
                maskedEndpoint: endpoint.maskedEndpoint,
                contactIds: endpoint.contactIds,
                inventoryIds: endpoint.inventoryIds,
                relationships: endpoint.relationships,
                consentState: endpoint.consentState,
                eligibility: endpoint.eligibility,
                dispatchState: endpoint.eligibility === 'SUPPRESSED_OPTOUT' ? 'SUPPRESSED' : 'PENDING'
            }));
            await OwnerOutreachRecipient.insertMany(docs, { ordered: true });
        } catch (error) {
            await OwnerOutreachCampaign.deleteOne({ _id: campaign._id });
            throw error;
        }
        return { campaign: campaign.toObject(), audience: { uniquePeople: audience.uniquePeople, uniqueEndpoints: audience.endpoints.length } };
    }

    async listCampaigns(user, limit = 50) {
        return OwnerOutreachCampaign.find({ createdBy: user._id }).sort({ createdAt: -1 }).limit(Math.min(Math.max(Number(limit) || 50, 1), 100)).lean();
    }

    async getCampaign(user, campaignId) {
        if (!mongoose.Types.ObjectId.isValid(campaignId)) return null;
        const campaign = await OwnerOutreachCampaign.findOne({ _id: campaignId, createdBy: user._id }).lean();
        if (!campaign) return null;
        const [byState, recipients] = await Promise.all([
            OwnerOutreachRecipient.aggregate([{ $match: { campaignId: campaign._id } }, { $group: { _id: { channel: '$channel', eligibility: '$eligibility', dispatchState: '$dispatchState' }, count: { $sum: 1 } } }]),
            OwnerOutreachRecipient.find({ campaignId: campaign._id }).select('channel maskedEndpoint eligibility dispatchState').limit(200).lean()
        ]);
        return { campaign, byState, recipients };
    }
}
