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

        console.log(`[EnterpriseAudience] 🚀 INITIATING FETCH — Source: ${source.toUpperCase()} | Filters: ${JSON.stringify(filters)}`);

        try {
            switch (source) {
                case 'lead': {
                    const query = this._buildLeadQuery(filters);
                    rawRecipients = await Lead.find(query)
                        .select('mobile email firstName lastName fullName project projectName stage status assignment updatedAt')
                        .populate('project', 'name')
                        .populate('stage', 'lookup_value')
                        .populate('status', 'lookup_value')
                        .sort({ updatedAt: -1 }) // Tier-1: Target active leads first
                        .lean();
                    return this._standardizeRecipients(rawRecipients, 'lead');
                }

                case 'contact': {
                    const query = this._buildContactQuery(filters);
                    rawRecipients = await Contact.find(query)
                        .select('name surname phones emails tags updatedAt')
                        .sort({ updatedAt: -1 })
                        .lean();
                    return this._standardizeRecipients(rawRecipients, 'contact');
                }

                case 'deal': {
                    const query = this._buildDealQuery(filters);
                    rawRecipients = await Deal.find(query)
                        .select('projectName unitNo stage owner associatedContact updatedAt')
                        .populate('owner associatedContact')
                        .sort({ updatedAt: -1 })
                        .lean();
                    return this._standardizeRecipients(rawRecipients, 'deal', filters.targetRole);
                }

                case 'inventory': {
                    const query = await this._buildInventoryQuery(filters);
                    rawRecipients = await Inventory.find(query)
                        .select('projectName unitNo unitNumber sector block owners associates updatedAt')
                        .populate({
                            path: 'owners',
                            select: 'name surname phones emails'
                        })
                        .populate({
                            path: 'associates.contact',
                            select: 'name surname phones emails'
                        })
                        .sort({ updatedAt: -1 })
                        .lean();

                    return this._standardizeRecipients(rawRecipients, 'inventory', filters.contactType || filters.targetRole);
                }

                default:
                    throw new Error(`Invalid audience source: "${source}"`);
            }
        } catch (error) {
            console.error(`[EnterpriseAudience] ❌ CRITICAL FAILURE [${source}]:`, error.message);
            throw error;
        }
    }

    // ─── ENTERPRISE LOOKUP RESOLVER ───────────────────────────────────────────
    async _resolveLookup(type, value) {
        if (!value || value === 'all') return null;
        const Lookup = mongoose.model('Lookup');
        
        // 1. Exact Match on ID
        if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);

        // 2. Fuzzy Match on Value (Case-Insensitive)
        const escapedValue = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lookup = await Lookup.findOne({
            lookup_type: new RegExp(type, 'i'),
            lookup_value: new RegExp(`^${escapedValue}$`, 'i')
        }).lean();

        return lookup ? lookup._id : null;
    }

    // ─── UPGRADED QUERY BUILDERS ──────────────────────────────────────────────
    
    _buildLeadQuery(filters) {
        const query = {};
        
        // Standard Filters
        if (filters.status && filters.status !== 'all') query.status = filters.status;
        if (filters.stage && filters.stage !== 'all') query.stage = filters.stage;
        if (filters.source && filters.source !== 'all') query.source = filters.source;

        // Smart Project Filter (Fuzzy Search Support)
        if (filters.project && filters.project !== 'all') {
            const pid = mongoose.Types.ObjectId.isValid(filters.project) ? new mongoose.Types.ObjectId(filters.project) : null;
            const projectName = String(filters.projectName || filters.project);
            const escapedName = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            const orArr = [{ projectName: new RegExp(escapedName, 'i') }];
            if (pid) orArr.push({ project: pid });
            query.$or = orArr;
        }

        // Recency Intel
        if (filters.recency && filters.recency !== 'all') {
            const days = parseInt(filters.recency);
            if (!isNaN(days)) {
                const since = new Date();
                since.setDate(since.getDate() - days);
                query.updatedAt = { $gte: since };
            }
        }

        return query;
    }

    async _buildInventoryQuery(filters) {
        const conditions = [];

        // Dynamic Project/Sector Intelligence
        if (filters.project && filters.project !== 'all') {
            const projectName = String(filters.projectName || filters.project);
            const escaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const projectOr = [
                { projectName: new RegExp(escaped, 'i') },
                { sector: new RegExp(escaped, 'i') }
            ];
            if (mongoose.Types.ObjectId.isValid(filters.project)) {
                projectOr.push({ projectId: new mongoose.Types.ObjectId(filters.project) });
            }
            conditions.push({ $or: projectOr });
        }

        // Resolve Enterprise Lookups
        const statusId = await this._resolveLookup('status', filters.status);
        if (statusId) conditions.push({ status: statusId });

        const categoryId = await this._resolveLookup('category', filters.category);
        if (categoryId) conditions.push({ category: categoryId });

        return conditions.length > 0 ? { $and: conditions } : {};
    }

    _buildContactQuery(filters) {
        const query = {};
        if (filters.recency && filters.recency !== 'all') {
            const days = parseInt(filters.recency);
            if (!isNaN(days)) {
                const since = new Date();
                since.setDate(since.getDate() - days);
                query.updatedAt = { $gte: since };
            }
        }
        return query;
    }

    _buildDealQuery(filters) {
        const query = {};
        if (filters.stage && filters.stage !== 'all') query.stage = filters.stage;
        if (filters.project && filters.project !== 'all') {
            if (mongoose.Types.ObjectId.isValid(filters.project)) query.projectId = new mongoose.Types.ObjectId(filters.project);
            else query.projectName = new RegExp(filters.project, 'i');
        }
        return query;
    }

    // ─── STANDARDIZE RECIPIENTS (HEAVY DUTY) ──────────────────────────────────
    _standardizeRecipients(items, type, targetRole = 'owner') {
        const recipients = [];
        const seenMobiles = new Set();

        const extractPhone = (person) => {
            if (!person) return '';
            // Lead Model Strategy
            if (person.mobile && typeof person.mobile === 'string') return normalizePhone(person.mobile);
            
            // Contact Model Strategy (Nested Array)
            if (Array.isArray(person.phones)) {
                for (const p of person.phones) {
                    const num = (p && typeof p === 'object') ? p.number : p;
                    const normalized = normalizePhone(num);
                    if (normalized) return normalized;
                }
            }
            return '';
        };

        const extractEmail = (person) => {
            if (!person) return '';
            if (person.email && typeof person.email === 'string') return person.email;
            if (Array.isArray(person.emails) && person.emails[0]) {
                const e = person.emails[0];
                return (e && typeof e === 'object') ? e.address : e;
            }
            return '';
        };

        items.forEach(item => {
            let candidates = [];
            
            if (type === 'inventory') {
                candidates = targetRole === 'associate' 
                    ? (item.associates || []).map(a => a.contact).filter(Boolean)
                    : (item.owners || []).filter(Boolean);
            } else if (type === 'deal') {
                candidates = [item.owner, item.associatedContact].filter(Boolean);
            } else {
                candidates = [item];
            }

            candidates.forEach(person => {
                const mobile = extractPhone(person);
                if (!mobile || mobile === '-' || seenMobiles.has(mobile)) return;

                seenMobiles.add(mobile);
                recipients.push({
                    id: person._id || item._id,
                    name: [person.name || person.firstName, person.surname || person.lastName].filter(Boolean).join(' ') || 'Standard Recipient',
                    mobile,
                    email: extractEmail(person),
                    context: {
                        originalType: type.charAt(0).toUpperCase() + type.slice(1),
                        projectName: item.projectName || item.project?.name || 'Generic',
                        unitNo: item.unitNo || item.unitNumber || 'N/A',
                        lastUpdated: item.updatedAt
                    }
                });
            });
        });

        return recipients;
    }

}

export default new MarketingAudienceService();
