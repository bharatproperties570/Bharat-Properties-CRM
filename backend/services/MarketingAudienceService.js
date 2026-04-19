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
                    query = await this._buildInventoryQuery(filters);
                    rawRecipients = await Inventory.find(query)
                        .select('project unitNo sector block unitNumber owners associates status category sizeType subCategory')
                        .populate('owners associates.contact status category sizeType subCategory')
                        .lean();
                    return this._standardizeRecipients(rawRecipients, 'inventory', filters.contactType || filters.targetRole);

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
            query.status = mongoose.Types.ObjectId.isValid(filters.status) ? new mongoose.Types.ObjectId(filters.status) : filters.status;
        }
        if (filters.project && filters.project !== 'all') {
            query.project = mongoose.Types.ObjectId.isValid(filters.project) ? new mongoose.Types.ObjectId(filters.project) : filters.project;
        }
        if (filters.source && filters.source !== 'all') {
            query.source = mongoose.Types.ObjectId.isValid(filters.source) ? new mongoose.Types.ObjectId(filters.source) : filters.source;
        }
        if (filters.segment && filters.segment !== 'all') {
            // Segment can be an ObjectId or a string (since some segments are derived)
            query.segment = mongoose.Types.ObjectId.isValid(filters.segment) ? new mongoose.Types.ObjectId(filters.segment) : filters.segment;
        }
        if (filters.assignedTo && filters.assignedTo !== 'all') {
            query['assignment.assignedTo'] = mongoose.Types.ObjectId.isValid(filters.assignedTo) ? new mongoose.Types.ObjectId(filters.assignedTo) : filters.assignedTo;
        }
        if (filters.budget && filters.budget !== 'all') {
            query.budget = mongoose.Types.ObjectId.isValid(filters.budget) ? new mongoose.Types.ObjectId(filters.budget) : filters.budget;
        }
        if (filters.tags && filters.tags.length > 0) {
            query.tags = { $in: filters.tags };
        }
        
        // Recency filter (last 30/60/90 days)
        if (filters.recency && filters.recency !== 'all') {
            const days = parseInt(filters.recency);
            const date = new Date();
            date.setDate(date.getDate() - days);
            query.updatedAt = { $gte: date };
        }

        return query;
    }

    _buildContactQuery(filters) {
        const query = { 'phones.0': { $exists: true } };
        if (filters.tags && filters.tags.length > 0) {
            query.tags = { $in: filters.tags };
        }
        if (filters.city && filters.city !== 'all') {
            query['personalAddress.city'] = new RegExp(filters.city, 'i');
        }
        if (filters.profession && filters.profession !== 'all') {
            query.professionCategory = mongoose.Types.ObjectId.isValid(filters.profession) ? new mongoose.Types.ObjectId(filters.profession) : filters.profession;
        }
        if (filters.segment && filters.segment !== 'all') {
            query.segment = filters.segment;
        }
        // Added recency for Contacts
        if (filters.recency && filters.recency !== 'all') {
            const days = parseInt(filters.recency);
            const date = new Date();
            date.setDate(date.getDate() - days);
            query.updatedAt = { $gte: date };
        }
        return query;
    }

    _buildDealQuery(filters) {
        const query = {};
        if (filters.stage && filters.stage !== 'all') {
            query.stage = filters.stage;
        }
        if (filters.project && filters.project !== 'all') {
            query.projectId = mongoose.Types.ObjectId.isValid(filters.project) ? new mongoose.Types.ObjectId(filters.project) : filters.project;
        }
        if (filters.owner && filters.owner !== 'all') {
            query.owner = mongoose.Types.ObjectId.isValid(filters.owner) ? new mongoose.Types.ObjectId(filters.owner) : filters.owner;
        }
        
        // Price Range
        if (filters.minPrice || filters.maxPrice) {
            query.expectedValue = {};
            if (filters.minPrice) query.expectedValue.$gte = parseFloat(filters.minPrice);
            if (filters.maxPrice) query.expectedValue.$lte = parseFloat(filters.maxPrice);
        }

        // Deal Type (Lease/Sale/Rent)
        if (filters.type && filters.type !== 'all') {
            query.type = filters.type;
        }

        return query;
    }

    async _buildInventoryQuery(filters) {
        const query = { $and: [] };
        const Lookup = mongoose.model('Lookup');
        
        // Helper to resolve string to ID if needed
        const resolveLookup = async (type, value) => {
            try {
                if (!value || value === 'all') return null;
                
                // If it's ALREADY a valid ObjectId string, return it as ObjectId
                if (typeof value === 'string' && value.length === 24 && /^[0-9a-fA-F]{24}$/.test(value)) {
                    return new mongoose.Types.ObjectId(value);
                }
                
                if (mongoose.Types.ObjectId.isValid(value) && typeof value !== 'string') {
                    return value;
                }

                // Otherwise, search by lookup_value
                const escapedValue = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const lookup = await Lookup.findOne({ 
                    lookup_type: new RegExp(`^${type}$`, 'i'), 
                    lookup_value: new RegExp(`^${escapedValue}$`, 'i') 
                }).lean();
                
                return lookup ? lookup._id : null;
            } catch (err) {
                console.warn(`[MarketingAudienceService] resolveLookup failed for ${type}:${value}`, err.message);
                return null;
            }
        };

        // Status Filtering
        if (filters.status && filters.status !== 'all') {
            const statusId = await resolveLookup('InventoryStatus', filters.status) || await resolveLookup('Status', filters.status);
            if (statusId) {
                query.$and.push({ status: statusId });
            } else {
                // Fallback for direct string matches if denormalized
                query.$and.push({
                    $or: [
                        { statusName: new RegExp(filters.status, 'i') },
                        { status: filters.status }
                    ]
                });
            }
        }

        // Project Filtering (Highly Robust Partial Match)
        if (filters.project && filters.project !== 'all') {
            if (mongoose.Types.ObjectId.isValid(filters.project)) {
                query.$and.push({ 
                    $or: [
                        { project: new mongoose.Types.ObjectId(filters.project) },
                        { projectId: new mongoose.Types.ObjectId(filters.project) }
                    ]
                });
            } else {
                const escapedProject = filters.project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                query.$and.push({
                    $or: [
                        { projectName: new RegExp(escapedProject, 'i') },
                        { sector: new RegExp(escapedProject, 'i') },
                        { project: new RegExp(escapedProject, 'i') },
                        { 'address.area': new RegExp(escapedProject, 'i') }
                    ]
                });
            }
        }

        // Unit/UnitNo Fallback
        // (Even if not filtered by UI, we ensure the query can handle these if passed)
        if (filters.unitNo && filters.unitNo !== 'all') {
             query.$and.push({
                $or: [
                    { unitNo: new RegExp(filters.unitNo, 'i') },
                    { unitNumber: new RegExp(filters.unitNo, 'i') }
                ]
             });
        }
        // Category & Sub-Category (Resolve to IDs)
        if (filters.category && filters.category !== 'all') {
            const catId = await resolveLookup('PropertyCategory', filters.category) || await resolveLookup('Category', filters.category);
            if (catId) {
                query.$and.push({ category: catId });
            } else {
                query.$and.push({ category: new RegExp(filters.category, 'i') });
            }
        }

        if (filters.subCategory && filters.subCategory !== 'all') {
            const subCatId = await resolveLookup('PropertySubCategory', filters.subCategory) || await resolveLookup('SubCategory', filters.subCategory);
            if (subCatId) {
                query.$and.push({ subCategory: subCatId });
            } else {
                query.$and.push({ subCategory: new RegExp(filters.subCategory, 'i') });
            }
        }

        // Size Label (Fuzzy Matching)
        if (filters.sizeLabel && filters.sizeLabel !== 'all') {
            query.$and.push({
                $or: [
                    { sizeLabel: new RegExp(filters.sizeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
                    { unitType: new RegExp(filters.sizeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
                ]
            });
        }

        return query.$and.length > 0 ? query : {};
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
                            unitNo: item.unitNo || item.unitNumber || 'N/A',
                            projectName: item.projectName || item.project?.name || 'Unknown Project',
                            sector: item.sector || item.project?.address?.area || item.address?.area || 'N/A',
                            sizeType: item.sizeType?.lookup_value || item.sizeLabel || 'N/A'
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
