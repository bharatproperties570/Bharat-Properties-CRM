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
        let query = {};
        let rawRecipients = [];

        try {
            switch (source) {
                case 'lead':
                    query = this._buildLeadQuery(filters);
                    rawRecipients = await Lead.find(query)
                        .select('mobile email firstName lastName fullName budget status source project subRequirement unitType roadWidth assignment')
                        .populate('status source project budget subRequirement unitType roadWidth assignment.assignedTo')
                        .lean();
                    return this._standardizeRecipients(rawRecipients, 'lead');

                case 'contact':
                    query = this._buildContactQuery(filters);
                    rawRecipients = await Contact.find(query)
                        .select('name surname phones emails tags professionCategory personalAddress')
                        .populate('professionCategory')
                        .lean();
                    return this._standardizeRecipients(rawRecipients, 'contact');

                case 'deal':
                    query = this._buildDealQuery(filters);
                    rawRecipients = await Deal.find(query)
                        .select('projectName unitNo stage owner associatedContact')
                        .populate('owner associatedContact')
                        .lean();
                    return this._standardizeRecipients(rawRecipients, 'deal', filters.targetRole);

                case 'inventory':
                    query = this._buildInventoryQuery(filters);
                    rawRecipients = await Inventory.find(query)
                        .select('projectName unitNo sector block unitNumber owners associates status category sizeType')
                        .populate('owners associates.contact status category sizeType')
                        .lean();
                    return this._standardizeRecipients(rawRecipients, 'inventory', filters.targetRole);

                default:
                    throw new Error(`Invalid audience source: ${source}`);
            }
        } catch (error) {
            console.error(`[MarketingAudienceService] Error fetching audience for ${source}:`, error);
            throw error;
        }
    }

    _buildLeadQuery(filters) {
        const query = { mobile: { $exists: true, $ne: '' } };
        if (filters.status && filters.status !== 'all') {
            query.status = filters.status;
        }
        if (filters.project && filters.project !== 'all') {
            query.project = filters.project;
        }
        if (filters.source && filters.source !== 'all') {
            query.source = filters.source;
        }
        if (filters.tags && filters.tags.length > 0) {
            query.tags = { $in: filters.tags };
        }
        return query;
    }

    _buildContactQuery(filters) {
        const query = { 'phones.0': { $exists: true } };
        if (filters.tags && filters.tags.length > 0) {
            query.tags = { $in: filters.tags };
        }
        if (filters.city && filters.city !== 'all') {
            query['personalAddress.city'] = filters.city;
        }
        if (filters.profession && filters.profession !== 'all') {
            query.professionCategory = filters.profession;
        }
        return query;
    }

    _buildDealQuery(filters) {
        const query = {};
        if (filters.stage && filters.stage !== 'all') {
            query.stage = filters.stage;
        }
        if (filters.project && filters.project !== 'all') {
            query.projectId = filters.project;
        }
        return query;
    }

    _buildInventoryQuery(filters) {
        const query = {};
        if (filters.status && filters.status !== 'all') {
            query.status = filters.status;
        }
        if (filters.sector && filters.sector !== 'all') {
            query.sector = filters.sector;
        }
        if (filters.category && filters.category !== 'all') {
            query.category = filters.category;
        }
        if (filters.sizeType && filters.sizeType !== 'all') {
            query.sizeType = filters.sizeType;
        }
        return query;
    }

    /**
     * Standardizes different CRM models into a common Recipient interface.
     */
    _standardizeRecipients(items, type, targetRole = 'owner') {
        const recipients = [];
        const seenMobiles = new Set();

        items.forEach(item => {
            let name = '';
            let mobile = '';
            let email = '';
            let context = {};

            if (type === 'lead') {
                name = item.fullName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Lead';
                mobile = normalizePhone(item.mobile);
                email = item.email;
                context = { 
                    originalType: 'Lead',
                    status: item.status?.lookup_value || 'Active',
                    projectName: item.project?.name || item.projectName || '',
                    subCategory: item.subRequirement?.lookup_value || '',
                    sizeType: item.areaMetric || '',
                    unitType: (item.unitType || []).map(u => u.lookup_value || u).filter(Boolean).join(', ') || '',
                    road: (item.roadWidth || []).map(r => r.lookup_value || r).filter(Boolean).join(', ') || '',
                    agentMobile: item.assignment?.assignedTo?.mobile || ''
                };
            } 
            else if (type === 'contact') {
                name = `${item.name || ''} ${item.surname || ''}`.trim() || 'Contact';
                mobile = normalizePhone(item.phones?.[0]?.number);
                email = item.emails?.[0]?.address;
                context = { originalType: 'Contact', tags: item.tags || [] };
            }
            else if (type === 'deal') {
                // Target Owner or Buyer/Associate based on filter
                const person = targetRole === 'buyer' ? item.buyer : item.owner || item.associatedContact;
                if (!person || typeof person !== 'object') return;
                
                name = person.name || person.fullName || person.firstName || 'Participant';
                mobile = normalizePhone(person.phones?.[0]?.number || person.mobile);
                email = person.emails?.[0]?.address || person.email;
                context = { 
                    originalType: 'Deal',
                    dealStage: item.stage,
                    projectName: item.projectName,
                    unitNo: item.unitNo
                };
            }
            else if (type === 'inventory') {
                // Target list of owners or associates
                const activePeople = targetRole === 'associate' ? (item.associates || []).map(a => a.contact) : (item.owners || []);
                
                activePeople.forEach(person => {
                    // Safety check: Ensure person is populated and has a mobile/phone
                    if (!person || typeof person !== 'object') return;
                    
                    const pMobile = normalizePhone(person.phones?.[0]?.number || person.mobile);
                    if (!pMobile || seenMobiles.has(pMobile)) return;

                    seenMobiles.add(pMobile);
                    recipients.push({
                        id: person._id,
                        name: person.name || person.fullName || person.firstName || 'Owner',
                        mobile: pMobile,
                        email: person.emails?.[0]?.address || person.email,
                        context: {
                            originalType: 'Inventory',
                            unitNo: item.unitNo || item.unitNumber,
                            projectName: item.projectName,
                            sector: item.sector,
                            sizeType: item.sizeType?.lookup_value
                        }
                    });
                });
                return; // Early return as we pushed multiple
            }

            if (mobile && !seenMobiles.has(mobile)) {
                seenMobiles.add(mobile);
                recipients.push({
                    id: item._id,
                    name,
                    mobile,
                    email,
                    context
                });
            }
        });

        return recipients;
    }
}

export default new MarketingAudienceService();
