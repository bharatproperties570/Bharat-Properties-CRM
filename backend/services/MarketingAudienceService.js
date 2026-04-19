import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import Contact from '../models/Contact.js';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import { normalizePhone } from '../utils/normalization.js';

class MarketingAudienceService {
    /**
     * Fetch unified audience segments from CRM data with smart deduplication.
     * @param {Object} config - { source: 'lead'|'contact'|'deal'|'inventory', filters: {} }
     */
    async getAudience(config) {
        const source = (config.source || '').toLowerCase();
        const filters = config.filters || {};
        let rawRecipients = [];

        console.log(`[AudienceService] FETCH START — source="${source}" filters=${JSON.stringify(filters)}`);

        try {
            switch (source) {
                case 'lead': {
                    const query = this._buildLeadQuery(filters);
                    console.log('[AudienceService] LEAD_QUERY:', JSON.stringify(query));
                    rawRecipients = await Lead.find(query)
                        .select('mobile email firstName lastName fullName project projectName stage status assignment')
                        .populate('project', 'name')
                        .populate('stage', 'lookup_value')
                        .populate('status', 'lookup_value')
                        .lean();
                    console.log(`[AudienceService] LEAD_RAW_COUNT: ${rawRecipients.length}`);
                    const result = this._standardizeRecipients(rawRecipients, 'lead');
                    console.log(`[AudienceService] LEAD_RECIPIENTS: ${result.length}`);
                    return result;
                }

                case 'contact': {
                    const query = this._buildContactQuery(filters);
                    console.log('[AudienceService] CONTACT_QUERY:', JSON.stringify(query));
                    rawRecipients = await Contact.find(query)
                        .select('name surname phones emails tags')
                        .lean();
                    console.log(`[AudienceService] CONTACT_RAW_COUNT: ${rawRecipients.length}`);
                    return this._standardizeRecipients(rawRecipients, 'contact');
                }

                case 'deal': {
                    const query = this._buildDealQuery(filters);
                    rawRecipients = await Deal.find(query)
                        .select('projectName unitNo stage owner associatedContact')
                        .populate('owner associatedContact')
                        .lean();
                    return this._standardizeRecipients(rawRecipients, 'deal', filters.targetRole);
                }

                case 'inventory': {
                    const query = await this._buildInventoryQuery(filters);
                    console.log('[AudienceService] INVENTORY_QUERY:', JSON.stringify(query));

                    rawRecipients = await Inventory.find(query)
                        .select('projectName unitNo unitNumber sector block owners associates')
                        .populate({
                            path: 'owners',
                            select: 'name surname phones emails'   // Contact model: phones[].number
                        })
                        .populate({
                            path: 'associates.contact',
                            select: 'name surname phones emails'
                        })
                        .lean();

                    console.log(`[AudienceService] INVENTORY_RAW_COUNT: ${rawRecipients.length}`);
                    // Log first record for debugging
                    if (rawRecipients.length > 0) {
                        console.log('[AudienceService] FIRST_RECORD_OWNERS:', JSON.stringify(rawRecipients[0].owners));
                    }

                    const result = this._standardizeRecipients(rawRecipients, 'inventory', filters.contactType || filters.targetRole);
                    console.log(`[AudienceService] INVENTORY_RECIPIENTS: ${result.length}`);
                    return result;
                }

                default:
                    throw new Error(`Invalid audience source: "${source}"`);
            }
        } catch (error) {
            console.error(`[AudienceService] CRITICAL ERROR for source="${source}":`, error.message);
            throw error;
        }
    }

    // ─── LEAD QUERY ───────────────────────────────────────────────────────────
    _buildLeadQuery(filters) {
        // FIX: Do NOT pre-filter on mobile here — we handle empty mobiles in standardize
        // Previously { mobile: { $exists: true, $ne: '' } } was dropping valid leads
        const query = {};

        if (filters.status && filters.status !== 'all') {
            query.status = mongoose.Types.ObjectId.isValid(filters.status)
                ? new mongoose.Types.ObjectId(filters.status)
                : filters.status;
        }

        if (filters.stage && filters.stage !== 'all') {
            query.stage = mongoose.Types.ObjectId.isValid(filters.stage)
                ? new mongoose.Types.ObjectId(filters.stage)
                : filters.stage;
        }

        if (filters.project && filters.project !== 'all') {
            const searchName = String(filters.projectName || filters.project || '');
            const escaped = searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const orConditions = [
                { projectName: new RegExp(escaped, 'i') }
            ];
            if (mongoose.Types.ObjectId.isValid(filters.project)) {
                try {
                    orConditions.push({ project: new mongoose.Types.ObjectId(filters.project) });
                } catch (e) {}
            }
            query.$and = query.$and || [];
            query.$and.push({ $or: orConditions });
        }

        if (filters.source && filters.source !== 'all') {
            query.source = mongoose.Types.ObjectId.isValid(filters.source)
                ? new mongoose.Types.ObjectId(filters.source)
                : filters.source;
        }

        if (filters.recency && filters.recency !== 'all') {
            const days = parseInt(filters.recency);
            const since = new Date();
            since.setDate(since.getDate() - days);
            query.updatedAt = { $gte: since };
        }

        return query;
    }

    // ─── CONTACT QUERY ────────────────────────────────────────────────────────
    _buildContactQuery(filters) {
        // FIX: Do NOT pre-filter on phones existence — handle in standardize
        const query = {};

        if (filters.recency && filters.recency !== 'all') {
            const days = parseInt(filters.recency);
            const since = new Date();
            since.setDate(since.getDate() - days);
            query.updatedAt = { $gte: since };
        }

        return query;
    }

    // ─── DEAL QUERY ───────────────────────────────────────────────────────────
    _buildDealQuery(filters) {
        const query = {};
        if (filters.stage && filters.stage !== 'all') query.stage = filters.stage;
        if (filters.project && filters.project !== 'all') {
            query.projectId = mongoose.Types.ObjectId.isValid(filters.project)
                ? new mongoose.Types.ObjectId(filters.project)
                : filters.project;
        }
        if (filters.owner && filters.owner !== 'all') {
            query.owner = mongoose.Types.ObjectId.isValid(filters.owner)
                ? new mongoose.Types.ObjectId(filters.owner)
                : filters.owner;
        }
        if (filters.minPrice || filters.maxPrice) {
            query.expectedValue = {};
            if (filters.minPrice) query.expectedValue.$gte = parseFloat(filters.minPrice);
            if (filters.maxPrice) query.expectedValue.$lte = parseFloat(filters.maxPrice);
        }
        if (filters.type && filters.type !== 'all') query.type = filters.type;
        return query;
    }

    // ─── INVENTORY QUERY ──────────────────────────────────────────────────────
    async _buildInventoryQuery(filters) {
        const conditions = [];

        // Project filter — dual-track: ID + Name
        if (filters.project && filters.project !== 'all') {
            const searchName = String(filters.projectName || filters.project || '');
            const escaped = searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            const projectOr = [
                { projectName: new RegExp(escaped, 'i') },
                { sector: new RegExp(escaped, 'i') }
            ];

            if (mongoose.Types.ObjectId.isValid(filters.project)) {
                try {
                    const pid = new mongoose.Types.ObjectId(filters.project);
                    projectOr.push({ projectId: pid });
                } catch (e) {}
            }

            conditions.push({ $or: projectOr });
        }

        // Status filter
        if (filters.status && filters.status !== 'all') {
            const Lookup = mongoose.model('Lookup');
            const escaped = String(filters.status).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const lookup = await Lookup.findOne({
                lookup_type: /status/i,
                lookup_value: new RegExp(`^${escaped}$`, 'i')
            }).lean();

            if (lookup) {
                conditions.push({ status: lookup._id });
            }
        }

        // Category filter
        if (filters.category && filters.category !== 'all') {
            const Lookup = mongoose.model('Lookup');
            const escaped = String(filters.category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const lookup = await Lookup.findOne({
                lookup_type: /category/i,
                lookup_value: new RegExp(`^${escaped}$`, 'i')
            }).lean();

            if (lookup) {
                conditions.push({ category: lookup._id });
            }
        }

        return conditions.length > 0 ? { $and: conditions } : {};
    }

    // ─── STANDARDIZE ──────────────────────────────────────────────────────────
    /**
     * Converts raw DB records into a unified Recipient format.
     * KEY FIX: Contact model stores phones as [{number, type}] — NOT a flat string.
     */
    _standardizeRecipients(items, type, targetRole = 'owner') {
        const recipients = [];
        const seenMobiles = new Set();

        /**
         * FIX: Extract mobile from Contact's phones array correctly.
         * phones is [{number: '9876543210', type: 'Personal'}, ...]
         */
        const extractPhone = (person) => {
            if (!person) return '';
            // Check flat mobile field first (Lead model)
            if (person.mobile && typeof person.mobile === 'string') {
                return normalizePhone(person.mobile);
            }
            // Check phones array (Contact model)
            if (Array.isArray(person.phones) && person.phones.length > 0) {
                for (const p of person.phones) {
                    // p is {number: '...', type: '...'}
                    const num = (typeof p === 'object' && p !== null) ? p.number : p;
                    const normalized = normalizePhone(num);
                    if (normalized) return normalized;
                }
            }
            return '';
        };

        items.forEach(item => {
            if (type === 'inventory') {
                // For inventory, extract from owners or associates
                const people = targetRole === 'associate'
                    ? (item.associates || []).map(a => a.contact).filter(Boolean)
                    : (item.owners || []).filter(Boolean);

                people.forEach(person => {
                    if (!person || typeof person !== 'object') return;

                    const mobile = extractPhone(person);
                    if (!mobile || mobile === '-' || seenMobiles.has(mobile)) return;

                    seenMobiles.add(mobile);
                    recipients.push({
                        id: person._id,
                        name: [person.name, person.surname].filter(Boolean).join(' ') || 'Owner',
                        mobile,
                        email: Array.isArray(person.emails) ? person.emails[0]?.address : person.email,
                        context: {
                            originalType: 'Inventory',
                            unitNo: item.unitNo || item.unitNumber || 'N/A',
                            projectName: item.projectName || 'N/A',
                            sector: item.sector || 'N/A'
                        }
                    });
                });
                return;
            }

            // Lead
            if (type === 'lead') {
                const mobile = extractPhone(item);
                const name = item.fullName ||
                    [item.firstName, item.lastName].filter(Boolean).join(' ') ||
                    'Lead';
                const email = item.email;

                if (!mobile || seenMobiles.has(mobile)) return;
                seenMobiles.add(mobile);
                recipients.push({
                    id: item._id,
                    name,
                    mobile,
                    email,
                    context: {
                        originalType: 'Lead',
                        stage: item.stage?.lookup_value || '',
                        projectName: item.project?.name || item.projectName?.[0] || ''
                    }
                });
                return;
            }

            // Contact
            if (type === 'contact') {
                const mobile = extractPhone(item);
                const name = [item.name, item.surname].filter(Boolean).join(' ') || 'Contact';

                if (!mobile || seenMobiles.has(mobile)) return;
                seenMobiles.add(mobile);
                recipients.push({
                    id: item._id,
                    name,
                    mobile,
                    email: Array.isArray(item.emails) ? item.emails[0]?.address : '',
                    context: { originalType: 'Contact' }
                });
                return;
            }

            // Deal
            if (type === 'deal') {
                const person = targetRole === 'buyer' ? item.buyer : (item.owner || item.associatedContact);
                if (!person || typeof person !== 'object') return;

                const mobile = extractPhone(person);
                if (!mobile || seenMobiles.has(mobile)) return;
                seenMobiles.add(mobile);
                recipients.push({
                    id: item._id,
                    name: person.name || person.firstName || 'Participant',
                    mobile,
                    email: Array.isArray(person.emails) ? person.emails[0]?.address : person.email,
                    context: {
                        originalType: 'Deal',
                        projectName: item.projectName,
                        unitNo: item.unitNo
                    }
                });
            }
        });

        return recipients;
    }
}

export default new MarketingAudienceService();
