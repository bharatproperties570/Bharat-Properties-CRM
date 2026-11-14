import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import OwnerOutreachCampaign from '../models/OwnerOutreachCampaign.js';
import OwnerOutreachRecipient from '../models/OwnerOutreachRecipient.js';
import OwnerOutreachBatch from '../models/OwnerOutreachBatch.js';
import { getVisibilityFilter } from '../utils/visibility.js';
import { buildOwnerOutreachAudience, OWNER_OUTREACH_BATCH_SIZES, OWNER_OUTREACH_FREQUENCIES } from '../utils/ownerOutreachAudience.js';

const MAX_INVENTORY_SNAPSHOT = 10000;
const phaseOneChannels = new Set(['whatsapp']);

export function validateCampaignConfig(input = {}) {
    if (!input.name || typeof input.name !== 'string' || !input.name.trim()) throw new Error('Campaign name is required');
    if (typeof input.messageBody !== 'string' || !input.messageBody.trim() || input.messageBody.length > 4096) throw new Error('WhatsApp message text is required and must be 1–4096 characters');
    if (!mongoose.Types.ObjectId.isValid(input.providerAccountId)) throw new Error('A connected WhatsApp account must be selected');
    if (!OWNER_OUTREACH_FREQUENCIES.includes(input.frequency)) throw new Error('Invalid campaign frequency');
    if (!OWNER_OUTREACH_BATCH_SIZES.includes(Number(input.batchSize))) throw new Error('Invalid batch size');
    if (!Array.isArray(input.channels) || input.channels.length === 0 || input.channels.some((c) => !['whatsapp', 'sms', 'rcs', 'email'].includes(c))) throw new Error('Select at least one supported channel');
    if (input.channels.some((channel) => !phaseOneChannels.has(channel))) {
        throw new Error('SMS, RCS and Email are unavailable in Phase 1 until channel-specific consent evidence and provider adapters are implemented');
    }

    // Phase 1 creates a single primary-channel schedule only. Fallback and
    // sequence semantics are deliberately rejected until their delivery-state
    // orchestration, consent re-checks and idempotent transition logic exist.
    const strategy = input.channelStrategy || 'PRIMARY_ONLY';
    if (strategy !== 'PRIMARY_ONLY') {
        throw new Error('Only PRIMARY_ONLY is available in Phase 1; fallback and sequence are not implemented');
    }
    if (input.channels.length !== 1) throw new Error('PRIMARY_ONLY requires exactly one selected channel');

    const startAt = new Date(input.startAt);
    if (!Number.isFinite(startAt.getTime())) throw new Error('A valid campaign start date/time is required');
    const endAt = input.endAt ? new Date(input.endAt) : null;
    if (endAt && (!Number.isFinite(endAt.getTime()) || endAt < startAt)) throw new Error('Campaign end date must be a valid date after start date');

    const window = input.dispatchWindow || { start: '10:00', end: '18:00' };
    const validClock = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!validClock(window.start) || !validClock(window.end) || window.start >= window.end) {
        throw new Error('Dispatch window must be valid 24-hour HH:mm values with end after start');
    }
    return { startAt, endAt };
}


export function addCadence(startAt, frequency, offset) {
    const date = new Date(startAt);
    if (frequency === 'DAILY') date.setUTCDate(date.getUTCDate() + offset);
    else if (frequency === 'WEEKLY') date.setUTCDate(date.getUTCDate() + (7 * offset));
    else if (frequency === 'MONTHLY') {
        const day = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + offset);
        const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(day, lastDay));
    } else if (frequency === 'YEARLY') {
        const month = date.getUTCMonth();
        const day = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCFullYear(date.getUTCFullYear() + offset);
        date.setUTCMonth(month);
        const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(day, lastDay));
    }
    return date;
}

export default class OwnerOutreachService {
    async searchInventory(input = {}, user) {
        const term = typeof input.q === 'string' ? input.q.trim().slice(0, 100) : '';
        if (term.length < 2) return { items: [], minimumQueryLength: 2 };
        const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 50);
        const visibility = user ? await getVisibilityFilter(user) : { _id: null };
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, (character) => '\\' + character);
        const matcher = new RegExp(escaped, 'i');
        const query = {
            $and: [
                visibility,
                { isDeleted: { $ne: true } },
                { $or: [
                    { projectName: matcher }, { project: matcher }, { sector: matcher },
                    { unitNo: matcher }, { unitNumber: matcher },
                    { sizeLabel: matcher }, { description: matcher }
                ] }
            ]
        };
        const rows = await Inventory.find(query)
            .select('_id projectName project unitNo unitNumber sector sizeLabel')
            .sort({ updatedAt: -1, _id: -1 })
            .limit(limit)
            .lean();
        return {
            items: rows.map((item) => ({
                id: String(item._id),
                project: item.projectName || item.project || item.sector || 'Unassigned project',
                unit: item.unitNo || item.unitNumber || 'Unit not specified',
                size: item.sizeLabel || '',
                label: [item.projectName || item.project || item.sector, item.unitNo || item.unitNumber].filter(Boolean).join(' · ') || String(item._id)
            })),
            limit
        };
    }

    async resolveAudience(input = {}, user) {
        const visibility = user ? await getVisibilityFilter(user) : { _id: null };
        const inventoryIds = Array.isArray(input.inventoryIds) ? input.inventoryIds : [];
        if (inventoryIds.length > MAX_INVENTORY_SNAPSHOT || inventoryIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
            throw new Error('Invalid inventory selection');
        }

        // Authorization and user filters must always intersect. In particular,
        // never overwrite visibility's own $or (private/team/everyone rules).
        const query = { $and: [visibility, { isDeleted: { $ne: true } }] };
        if (inventoryIds.length) {
            query.$and.push({ _id: { $in: inventoryIds.map((id) => new mongoose.Types.ObjectId(id)) } });
        }

        const filters = input.filters || {};
        if (filters.project && filters.project !== 'all') {
            const escaped = String(filters.project).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$and.push({ $or: [{ projectName: new RegExp(escaped, 'i') }, { project: new RegExp(escaped, 'i') }, { sector: new RegExp(escaped, 'i') }] });
        }
        if (filters.category && mongoose.Types.ObjectId.isValid(filters.category)) {
            query.$and.push({ category: new mongoose.Types.ObjectId(filters.category) });
        }
        if (filters.status && mongoose.Types.ObjectId.isValid(filters.status)) {
            query.$and.push({ status: new mongoose.Types.ObjectId(filters.status) });
        }

        const inventory = await Inventory.find(query)
            .select('_id projectName unitNo unitNumber sector owners associates')
            .populate({ path: 'owners', select: '_id name surname phones emails professionCategory professionSubCategory designation tags whatsappOptOut whatsappOptInAt whatsappOptOutAt' })
            .populate({ path: 'associates.contact', select: '_id name surname phones emails professionCategory professionSubCategory designation tags whatsappOptOut whatsappOptInAt whatsappOptOutAt' })
            .limit(MAX_INVENTORY_SNAPSHOT + 1)
            .lean();
        if (inventory.length > MAX_INVENTORY_SNAPSHOT) throw new Error('Audience exceeds the 10,000 inventory snapshot limit; narrow the inventory filters');
        const audience = buildOwnerOutreachAudience(inventory, {
            includeOwners: input.includeOwners !== false,
            includeAssociates: input.includeAssociates === true,
            excludeBrokers: input.excludeBrokers !== false
        });
        return { ...audience, inventoryCount: inventory.length, inventoryIds: inventory.map((item) => item._id) };
    }

    async preview(input, user) {
        const audience = await this.resolveAudience(input, user);
        const selected = input.channels?.length ? audience.endpoints.filter((item) => input.channels.includes(item.channel)) : audience.endpoints;
        const counts = {
            uniquePeople: new Set(selected.flatMap((item) => item.contactIds)).size,
            uniqueEndpoints: selected.length,
            byChannel: {},
            consentRequired: selected.filter((x) => x.eligibility === 'CONSENT_REQUIRED').length,
            suppressed: selected.filter((x) => x.eligibility === 'SUPPRESSED_OPTOUT').length
        };
        for (const endpoint of selected) counts.byChannel[endpoint.channel] = (counts.byChannel[endpoint.channel] || 0) + 1;
        return {
            inventoryCount: audience.inventoryCount,
            counts,
            endpoints: selected.map(({ channel, maskedEndpoint, eligibility, inventoryIds, relationships }) => ({ channel, maskedEndpoint, eligibility, inventoryCount: inventoryIds.length, relationships }))
        };
    }

    async createDraft(input, user) {
        const { startAt, endAt } = validateCampaignConfig(input);
        const audienceInput = input.audience || input;
        const audience = await this.resolveAudience(audienceInput, user);
        const selectedEndpoints = audience.endpoints.filter((endpoint) => input.channels.includes(endpoint.channel));
        if (!selectedEndpoints.length) throw new Error('No valid endpoints found for the selected channels');
        const session = await mongoose.startSession();
        let campaign;
        try {
            await session.withTransaction(async () => {
                const [createdCampaign] = await OwnerOutreachCampaign.create([{
                    name: input.name.trim(),
                    createdBy: user._id,
                    status: 'DRAFT',
                    audience: {
                        inventoryIds: audience.inventoryIds,
                        filters: audienceInput.filters || {},
                        includeOwners: audienceInput.includeOwners !== false,
                        includeAssociates: audienceInput.includeAssociates === true,
                        excludeBrokers: audienceInput.excludeBrokers !== false,
                        frozenAt: new Date()
                    },
                    channels: input.channels,
                    messageBody: input.messageBody.trim(),
                    providerAccountId: input.providerAccountId,
                    channelStrategy: input.channelStrategy || 'PRIMARY_ONLY',
                    frequency: input.frequency,
                    batchSize: Number(input.batchSize),
                    startAt,
                    endAt,
                    timezone: 'Asia/Kolkata',
                    dispatchWindow: input.dispatchWindow || { start: '10:00', end: '18:00' },
                    totals: {
                        uniquePeople: new Set(selectedEndpoints.flatMap((item) => item.contactIds)).size,
                        uniqueEndpoints: selectedEndpoints.length,
                        recipients: selectedEndpoints.length,
                        consentRequired: selectedEndpoints.filter((x) => x.eligibility === 'CONSENT_REQUIRED').length,
                        suppressed: selectedEndpoints.filter((x) => x.eligibility === 'SUPPRESSED_OPTOUT').length
                    }
                }], { session });
                campaign = createdCampaign;

                await OwnerOutreachRecipient.insertMany(selectedEndpoints.map((endpoint) => ({
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
                })), { ordered: true, session });
            }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
        } finally {
            await session.endSession();
        }
        return { campaign: campaign.toObject(), audience: { uniquePeople: new Set(selectedEndpoints.flatMap((item) => item.contactIds)).size, uniqueEndpoints: selectedEndpoints.length } };
    }

    async listCampaigns(user, limit = 50) {
        return OwnerOutreachCampaign.find({ createdBy: user._id }).sort({ createdAt: -1 }).limit(Math.min(Math.max(Number(limit) || 50, 1), 100)).lean();
    }


    async approveCampaign(user, campaignId) {
        if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error('Invalid campaign id');
        const session = await mongoose.startSession();
        let result;
        try {
            await session.withTransaction(async () => {
                const campaign = await OwnerOutreachCampaign.findOne({
                    _id: campaignId, createdBy: user._id, status: { $in: ['DRAFT', 'APPROVED'] }
                }).session(session);
                if (!campaign) throw new Error('Only an existing draft owned by you can be approved');

                // Idempotent retry: an already-approved campaign returns its existing ledger.
                if (campaign.status === 'APPROVED') {
                    const existing = await OwnerOutreachBatch.find({ campaignId: campaign._id }).session(session).lean();
                    result = {
                        campaign: campaign.toObject(),
                        plannedBatches: existing.length,
                        scheduledRecipients: existing.reduce((sum, batch) => sum + (batch.counts?.selected || 0), 0),
                        dispatchEnabled: false,
                        idempotent: true
                    };
                    return;
                }
                if (!campaign.audience?.frozenAt || !campaign.channels?.length) throw new Error('Campaign audience snapshot is incomplete');

                const eligible = await OwnerOutreachRecipient.find({
                    campaignId: campaign._id,
                    eligibility: 'ELIGIBLE',
                    consentState: 'CONSENTED',
                    dispatchState: 'PENDING'
                }).select('_id').sort({ _id: 1 }).session(session).lean();
                if (!eligible.length) throw new Error('No explicitly consented recipients are eligible for scheduling');

                const batches = [];
                let scheduledRecipients = 0;
                for (let offset = 0, sequence = 1; offset < eligible.length; offset += campaign.batchSize, sequence += 1) {
                    const scheduledAt = addCadence(campaign.startAt, campaign.frequency, sequence - 1);
                    if (campaign.endAt && scheduledAt > campaign.endAt) break;
                    const recipientIds = eligible.slice(offset, offset + campaign.batchSize).map((item) => item._id);
                    batches.push({
                        campaignId: campaign._id,
                        sequence,
                        status: 'SCHEDULED',
                        scheduledAt,
                        recipientIds,
                        counts: { selected: recipientIds.length }
                    });
                    scheduledRecipients += recipientIds.length;
                }
                if (!batches.length) throw new Error('Campaign end date does not include the first scheduled batch');

                campaign.status = 'APPROVED';
                campaign.approvedAt = new Date();
                campaign.nextRunAt = batches[0].scheduledAt;
                await campaign.save({ session });
                await OwnerOutreachBatch.insertMany(batches, { ordered: true, session });
                result = {
                    campaign: campaign.toObject(),
                    plannedBatches: batches.length,
                    scheduledRecipients,
                    dispatchEnabled: false,
                    idempotent: false
                };
            }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
            return result;
        } finally {
            await session.endSession();
        }
    }

    async pauseCampaign(user, campaignId) {
        if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error('Invalid campaign id');
        const session = await mongoose.startSession();
        let campaign;
        try {
            await session.withTransaction(async () => {
                campaign = await OwnerOutreachCampaign.findOneAndUpdate(
                    { _id: campaignId, createdBy: user._id, status: { $in: ['APPROVED', 'ACTIVE'] } },
                    { $set: { status: 'PAUSED', nextRunAt: null } },
                    { new: true, session }
                );
                if (!campaign) throw new Error('Only an approved or active campaign can be paused');
                // Campaign state and claim invalidation commit atomically. The
                // planner's final transaction also writes this campaign document,
                // so MongoDB serializes the two lifecycle transitions.
                await OwnerOutreachBatch.updateMany(
                    { campaignId: campaign._id, status: 'CLAIMED' },
                    { $set: { status: 'SCHEDULED', claim: { owner: null, token: null, claimedAt: null, leaseExpiresAt: null }, startedAt: null } },
                    { session }
                );
            }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
            return campaign;
        } finally {
            await session.endSession();
        }
    }

    async resumeCampaign(user, campaignId) {
        if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error('Invalid campaign id');
        const pending = await OwnerOutreachBatch.findOne({ campaignId, status: 'SCHEDULED' }).sort({ sequence: 1 }).lean();
        if (!pending) throw new Error('No scheduled batches remain; campaign cannot be resumed');
        const campaign = await OwnerOutreachCampaign.findOneAndUpdate(
            { _id: campaignId, createdBy: user._id, status: 'PAUSED' },
            { $set: { status: 'APPROVED', nextRunAt: pending.scheduledAt } },
            { new: true }
        );
        if (!campaign) throw new Error('Only a paused campaign can be resumed');
        return campaign;
    }

    async cancelCampaign(user, campaignId, reason = 'Cancelled by campaign owner') {
        if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error('Invalid campaign id');
        const session = await mongoose.startSession();
        let campaign;
        try {
            await session.withTransaction(async () => {
                campaign = await OwnerOutreachCampaign.findOneAndUpdate(
                    { _id: campaignId, createdBy: user._id, status: { $in: ['DRAFT', 'APPROVED', 'ACTIVE', 'PAUSED'] } },
                    { $set: { status: 'CANCELLED', nextRunAt: null, cancellationReason: String(reason).slice(0, 500) } },
                    { new: true, session }
                );
                if (!campaign) throw new Error('Campaign is already terminal or unavailable');
                await OwnerOutreachBatch.updateMany(
                    { campaignId: campaign._id, status: { $in: ['SCHEDULED', 'CLAIMED'] } },
                    { $set: { status: 'CANCELLED', claim: { owner: null, token: null, claimedAt: null, leaseExpiresAt: null }, startedAt: null } },
                    { session }
                );
            }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
            return campaign;
        } finally {
            await session.endSession();
        }
    }

    async getCampaign(user, campaignId) {
        if (!mongoose.Types.ObjectId.isValid(campaignId)) return null;
        const campaign = await OwnerOutreachCampaign.findOne({ _id: campaignId, createdBy: user._id }).lean();
        if (!campaign) return null;
        const [byState, recipients, batchGroups, batches] = await Promise.all([
            OwnerOutreachRecipient.aggregate([{ $match: { campaignId: campaign._id } }, { $group: { _id: { channel: '$channel', eligibility: '$eligibility', dispatchState: '$dispatchState' }, count: { $sum: 1 } } }]),
            OwnerOutreachRecipient.find({ campaignId: campaign._id }).select('channel maskedEndpoint eligibility dispatchState').sort({ _id: 1 }).limit(200).lean(),
            OwnerOutreachBatch.aggregate([
                { $match: { campaignId: campaign._id } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            OwnerOutreachBatch.find({ campaignId: campaign._id })
                .select('sequence status scheduledAt counts startedAt completedAt lastErrorCode createdAt updatedAt')
                .sort({ sequence: 1 }).limit(500).lean()
        ]);
        // Summary counts cover the complete ledger; the detailed table is a bounded sample.
        const batchSummary = batchGroups.reduce((summary, group) => {
            summary.total += group.count;
            summary.byStatus[group._id] = group.count;
            return summary;
        }, { total: 0, byStatus: {} });
        return {
            campaign,
            byState,
            recipients,
            batches,
            batchSummary,
            batchesTruncated: batchSummary.total > batches.length,
            dispatchEnabled: false,
            monitoringMode: 'SCHEDULE_LEDGER_ONLY'
        };
    }
}
