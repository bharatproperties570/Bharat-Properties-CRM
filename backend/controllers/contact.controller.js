import mongoose from "mongoose";
import Contact from "../models/Contact.js";
import Lead from "../models/Lead.js";
import Inventory from "../models/Inventory.js";
import Booking from "../models/Booking.js";
import Activity from "../models/Activity.js";
import DuplicationRule from "../models/DuplicationRule.js";
import { paginate } from "../utils/pagination.js";
import { createContactSchema, updateContactSchema } from "../validations/contact.validation.js";
import { syncDocumentsToInventory } from "../utils/sync.js";
import SmsLog from "../src/modules/sms/smsLog.model.js";
import { googleSyncQueue } from "../src/queues/queueManager.js";
import { getVisibilityFilter } from "../utils/visibility.js";

const populateFields = [
    { path: 'owner', select: 'fullName email name' },
    { path: 'team', select: 'name' },
    { path: 'teams', select: 'name' },
    { path: 'assignment.assignedTo', select: 'fullName email name' },
    { path: 'assignment.team', select: 'name' }
];

export const getContacts = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = "", phone } = req.query;
        const visibilityFilter = await getVisibilityFilter(req.user);
        
        // 🛠️ SENIOR DIAGNOSTIC LOG (Harden for potential undefined user)
        if (req.user) {
            console.log(`[VISIBLE_AUDIT] User: ${req.user.email}, Scope: ${req.user.dataScope}, Teams: ${JSON.stringify(req.user.teams?.map(t => t._id || t))}`);
        } else {
            console.log(`[VISIBLE_AUDIT] Anonymous request - Visibility restricted to public data.`);
        }
        console.log(`[VISIBLE_AUDIT] Generated Filter: ${JSON.stringify(visibilityFilter, null, 2)}`);

        let query = { ...visibilityFilter };

        if (phone) {
            query["phones.number"] = { $regex: new RegExp(`${phone}$`) };
        }

        if (search) {
            const searchFilter = {
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { description: { $regex: search, $options: "i" } },
                    { "phones.number": { $regex: search, $options: "i" } },
                    { "emails.address": { $regex: search, $options: "i" } }
                ]
            };
            // CORRECTED MERGE: Ensure top-level query keys are preserved while wrapping $or
            if (query.$or) {
                const securityOr = query.$or;
                delete query.$or;
                query.$and = (query.$and || []).concat([{ $or: securityOr }, searchFilter]);
            } else {
                Object.assign(query, searchFilter);
            }
        }

        // ─── DYNAMIC SORTING (Senior Professional Optimization) ───
        const sortBy = req.query.sortBy || 'updatedAt';
        const sortOrder = parseInt(req.query.sortOrder) || -1;
        const sortOption = { [sortBy]: sortOrder };

        console.log(`[Contacts Backend Debug] Query: ${JSON.stringify(query)}`);
        console.log(`[Contacts Backend Debug] Sort: ${JSON.stringify(sortOption)}`);

        const results = await paginate(Contact, query, Number(page), Number(limit), sortOption, populateFields);
        console.log(`[Contacts Backend Debug] Records Found: ${results.records?.length}`);

        // Attach Interaction Data (Activity Counts & Recent Activities)
        if (results.records && results.records.length > 0) {
            const contactIds = results.records.map(r => r._id);
            const contactIdsStr = contactIds.map(id => id.toString());

            // 1. Fetch recent activities for display/scoring
            const allActivities = await Activity.find({
                entityId: { $in: contactIdsStr },
                status: 'Completed'
            }).sort({ createdAt: -1 }).lean();

            // 2. Fetch all relevant SMS logs
            const allSmsLogs = await SmsLog.find({
                entityId: { $in: contactIdsStr },
                status: { $in: ['Sent', 'Delivered'] }
            }).lean();

            const activityGroup = new Map();
            const countsMap = new Map(); // Map<contactId, {call, siteVisit, meeting, email, sms, whatsapp}>

            // Initialize counts for all contacts on page
            contactIdsStr.forEach(id => {
                countsMap.set(id, { call: 0, siteVisit: 0, meeting: 0, email: 0, sms: 0, whatsapp: 0 });
            });

            allActivities.forEach(act => {
                const id = act.entityId.toString();
                if (!activityGroup.has(id)) activityGroup.set(id, []);
                if (activityGroup.get(id).length < 10) {
                    activityGroup.get(id).push(act);
                }

                if (countsMap.has(id)) {
                    const contactCounts = countsMap.get(id);
                    const t = (act.type || "").toLowerCase();
                    if (t.includes('call')) contactCounts.call++;
                    else if (t.includes('meeting')) contactCounts.meeting++;
                    else if (t.includes('site visit')) contactCounts.siteVisit++;
                    else if (t.includes('email')) contactCounts.email++;
                    else if (t.includes('whatsapp') || t.includes('messaging')) contactCounts.whatsapp++;
                }
            });

            allSmsLogs.forEach(log => {
                const id = log.entityId.toString();
                if (countsMap.has(id)) {
                    countsMap.get(id).sms++;
                }
            });

            // ─── BATCH LOOKUP HYDRATION (Senior Performance Optimization) ───
            const uniqueLookupIds = new Set();
            const mixedFields = ['title', 'countryCode', 'professionCategory', 'professionSubCategory', 'designation', 'source', 'subSource', 'campaign', 'requirement', 'budget', 'location'];
            const addressFields = ['country', 'state', 'city', 'tehsil', 'postOffice', 'pincode', 'location'];
            
            results.records.forEach(contact => {
                const c = contact.toObject ? contact.toObject() : contact;
                mixedFields.forEach(f => { if (c[f] && mongoose.Types.ObjectId.isValid(c[f])) uniqueLookupIds.add(c[f].toString()); });
                ['personalAddress', 'correspondenceAddress'].forEach(addr => {
                    if (c[addr]) addressFields.forEach(f => { if (c[addr][f] && mongoose.Types.ObjectId.isValid(c[addr][f])) uniqueLookupIds.add(c[addr][f].toString()); });
                });
                if (Array.isArray(c.educations)) c.educations.forEach(e => { if (e.education && mongoose.Types.ObjectId.isValid(e.education)) uniqueLookupIds.add(e.education.toString()); if (e.degree && mongoose.Types.ObjectId.isValid(e.degree)) uniqueLookupIds.add(e.degree.toString()); });
                if (Array.isArray(c.loans)) c.loans.forEach(l => { if (l.loanType && mongoose.Types.ObjectId.isValid(l.loanType)) uniqueLookupIds.add(l.loanType.toString()); if (l.bank && mongoose.Types.ObjectId.isValid(l.bank)) uniqueLookupIds.add(l.bank.toString()); });
                if (Array.isArray(c.incomes)) c.incomes.forEach(i => { if (i.incomeType && mongoose.Types.ObjectId.isValid(i.incomeType)) uniqueLookupIds.add(i.incomeType.toString()); });
                if (Array.isArray(c.documents)) c.documents.forEach(d => { if (d.documentCategory && mongoose.Types.ObjectId.isValid(d.documentCategory)) uniqueLookupIds.add(d.documentCategory.toString()); if (d.documentType && mongoose.Types.ObjectId.isValid(d.documentType)) uniqueLookupIds.add(d.documentType.toString()); if (d.documentName && mongoose.Types.ObjectId.isValid(d.documentName)) uniqueLookupIds.add(d.documentName.toString()); });
            });

            const batchLookups = uniqueLookupIds.size > 0 ? await Lookup.find({ _id: { $in: [...uniqueLookupIds] } }).select('lookup_value').lean() : [];
            const lookupValueMap = new Map(batchLookups.map(l => [l._id.toString(), l.lookup_value]));

            results.records = results.records.map(contact => {
                const contactId = contact._id.toString();
                const contactActs = activityGroup.get(contactId) || [];
                const latest = contactActs[0];
                const c = contact.toObject ? contact.toObject() : contact;

                // Hydrate
                mixedFields.forEach(f => { if (c[f] && mongoose.Types.ObjectId.isValid(c[f])) { const r = lookupValueMap.get(c[f].toString()); if (r) c[f] = { _id: c[f], lookup_value: r }; } });
                ['personalAddress', 'correspondenceAddress'].forEach(addr => {
                    if (c[addr]) addressFields.forEach(f => { if (c[addr][f] && mongoose.Types.ObjectId.isValid(c[addr][f])) { const r = lookupValueMap.get(c[addr][f].toString()); if (r) c[addr][f] = { _id: c[addr][f], lookup_value: r }; } });
                });
                if (Array.isArray(c.educations)) c.educations.forEach(e => { if (e.education && mongoose.Types.ObjectId.isValid(e.education)) { const r = lookupValueMap.get(e.education.toString()); if (r) e.education = { _id: e.education, lookup_value: r }; } if (e.degree && mongoose.Types.ObjectId.isValid(e.degree)) { const r = lookupValueMap.get(e.degree.toString()); if (r) e.degree = { _id: e.degree, lookup_value: r }; } });
                if (Array.isArray(c.loans)) c.loans.forEach(l => { if (l.loanType && mongoose.Types.ObjectId.isValid(l.loanType)) { const r = lookupValueMap.get(l.loanType.toString()); if (r) l.loanType = { _id: l.loanType, lookup_value: r }; } if (l.bank && mongoose.Types.ObjectId.isValid(l.bank)) { const r = lookupValueMap.get(l.bank.toString()); if (r) l.bank = { _id: l.bank, lookup_value: r }; } });
                if (Array.isArray(c.incomes)) c.incomes.forEach(i => { if (i.incomeType && mongoose.Types.ObjectId.isValid(i.incomeType)) { const r = lookupValueMap.get(i.incomeType.toString()); if (r) i.incomeType = { _id: i.incomeType, lookup_value: r }; } });
                if (Array.isArray(c.documents)) c.documents.forEach(d => { if (d.documentCategory && mongoose.Types.ObjectId.isValid(d.documentCategory)) { const r = lookupValueMap.get(d.documentCategory.toString()); if (r) d.documentCategory = { _id: d.documentCategory, lookup_value: r }; } if (d.documentType && mongoose.Types.ObjectId.isValid(d.documentType)) { const r = lookupValueMap.get(d.documentType.toString()); if (r) d.documentType = { _id: d.documentType, lookup_value: r }; } if (d.documentName && mongoose.Types.ObjectId.isValid(d.documentName)) { const r = lookupValueMap.get(d.documentName.toString()); if (r) d.documentName = { _id: d.documentName, lookup_value: r }; } });

                return {
                    ...c,
                    activities: contactActs,
                    interactionCounts: countsMap.get(contactId) || { call: 0, siteVisit: 0, meeting: 0, email: 0, sms: 0, whatsapp: 0 },
                    activity: latest ? latest.subject : "None",
                    lastAct: latest ? new Date(latest.createdAt).toLocaleDateString() : "Today"
                };
            });
        }

        res.status(200).json({
            success: true,
            ...results
        });
    } catch (error) {
        console.error("[ERROR] getContacts failed:", error);
        next(error);
    }
};

export const getContact = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: "Invalid Contact ID format" });
        }
        const visibilityFilter = await getVisibilityFilter(req.user);
        const contact = await Contact.findOne({ _id: req.params.id, ...visibilityFilter }).populate(populateFields);
        if (!contact) return res.status(404).json({ success: false, error: "Contact not found or access denied" });

        // Attach Recent Activities and Interaction Counts
        const contactIdStr = req.params.id.toString();
        const recentActivities = await Activity.find({
            entityId: contactIdStr,
            status: 'Completed'
        }).sort({ createdAt: -1 }).limit(10).lean();

        // Aggregate counts from Activity collection
        const activityStats = await Activity.aggregate([
            {
                $match: {
                    entityId: new mongoose.Types.ObjectId(contactIdStr),
                    status: 'Completed'
                }
            },
            {
                $group: {
                    _id: "$type",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Aggregate counts from SmsLog collection
        const smsStatsCount = await SmsLog.countDocuments({
            entityId: new mongoose.Types.ObjectId(contactIdStr),
            status: { $in: ['Sent', 'Delivered'] }
        });

        const interactionCounts = { call: 0, siteVisit: 0, meeting: 0, email: 0, sms: smsStatsCount, whatsapp: 0 };
        activityStats.forEach(stat => {
            if (!stat._id) return;
            const t = stat._id.toLowerCase();
            if (t.includes('call')) interactionCounts.call += stat.count;
            else if (t.includes('meeting')) interactionCounts.meeting += stat.count;
            else if (t.includes('site visit')) interactionCounts.siteVisit += stat.count;
            else if (t.includes('email')) interactionCounts.email += stat.count;
            else if (t.includes('whatsapp') || t.includes('messaging')) interactionCounts.whatsapp += stat.count;
        });

        const contactData = contact.toObject();
        contactData.activities = recentActivities;
        contactData.interactionCounts = interactionCounts;
        const latest = recentActivities[0];
        contactData.activity = latest ? latest.subject : "None";
        contactData.lastAct = latest ? new Date(latest.createdAt).toLocaleDateString() : "Today";

        res.json({ success: true, data: contactData });
    } catch (error) {
        console.error("[ERROR] getContact failed:", error);
        next(error);
    }
};

const resolveAllReferenceFields = async (obj) => {
    if (!obj || typeof obj !== 'object') return;

    const promises = [];

    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        const value = obj[key];

        if (value === null || value === undefined) continue;

        if (typeof value === 'string') {
            if (value === "") {
                obj[key] = null;
                continue;
            }
            // Resolve common lookup fields if they are strings
            if (mongoose.Types.ObjectId.isValid(value)) continue;

            const lookupMap = {
                title: 'Title',
                countryCode: 'Country-Code',
                professionCategory: 'ProfessionalCategory',
                professionSubCategory: 'ProfessionalSubCategory',
                designation: 'ProfessionalDesignation',
                source: 'Source',
                subSource: 'SubSource',
                campaign: 'Campaign',
                requirement: 'Requirement',
                budget: 'Budget',
                location: 'Location'
            };

            if (lookupMap[key]) {
                promises.push((async () => {
                    obj[key] = await resolveLookup(lookupMap[key], value);
                })());
            } else if (key === 'owner' || key === 'assignedTo') {
                promises.push((async () => {
                    obj[key] = await resolveUser(value);
                })());
            }
        } else if (typeof value === 'object') {
            const refFields = [
                'title', 'countryCode', 'professionCategory', 'professionSubCategory',
                'designation', 'source', 'subSource', 'campaign', 'owner', 'assignedTo',
                'requirement', 'budget', 'location', 'country', 'state', 'city',
                'tehsil', 'postOffice', 'education', 'degree', 'loanType',
                'bank', 'platform', 'incomeType', 'documentCategory',
                'documentType', 'documentName', 'teams', 'team'
            ];

            if (value._id && refFields.includes(key)) {
                obj[key] = value._id;
            } else if (Array.isArray(value)) {
                // For arrays, we still handle them but try to keep them non-blocking for each other
                promises.push(Promise.all(value.map(async (item) => {
                    if (item && typeof item === 'object' && !(item instanceof mongoose.Types.ObjectId)) {
                        await resolveAllReferenceFields(item);
                    }
                    return item;
                })));
            } else if (!(value instanceof mongoose.Types.ObjectId)) {
                promises.push(resolveAllReferenceFields(value));
            }
        }
    }

    // --- OPTIMIZATION: Parallelize ALL resolutions ---
    await Promise.all(promises);

    // Sync top-level owner/team to assignment if missing
    if (obj.owner && (!obj.assignment || !obj.assignment.assignedTo)) {
        if (!obj.assignment) obj.assignment = {};
        obj.assignment.assignedTo = obj.owner;
    }
    if (obj.team && (!obj.assignment || !obj.assignment.team)) {
        if (!obj.assignment) obj.assignment = {};
        obj.assignment.team = Array.isArray(obj.team) ? obj.team : [obj.team];
    }
    
    // Sync plural 'teams' to legacy 'team' for backward compatibility if logic expects singular
    if (obj.teams && Array.isArray(obj.teams) && obj.teams.length > 0 && !obj.team) {
        obj.team = obj.teams[0];
    }
};

export const createContact = async (req, res, next) => {
    try {
        // Strip internal fields that shouldn't be in the create payload according to Joi
        const data = { ...req.body };
        delete data._id;
        delete data.id;
        delete data.__v;
        delete data.createdAt;
        delete data.updatedAt;
        delete data.fullName;

        const { error } = createContactSchema.validate(data);
        if (error) return res.status(400).json({ success: false, error: error.details[0].message });

        // Resolve All Reference Fields
        const cleanEmptyStrings = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            for (const key in obj) {
                if (obj[key] === "") {
                    obj[key] = null;
                } else if (obj[key] && typeof obj[key] === 'object' && !(obj[key] instanceof mongoose.Types.ObjectId)) {
                    cleanEmptyStrings(obj[key]);
                }
            }
        };

        // 🔒 Enterprise Isolation: Auto-tag with creator's department and teams
        if (req.user) {
            if (req.user.department && !data.department) data.department = req.user.department;
            if (req.user.teams && req.user.teams.length > 0 && (!data.teams || data.teams.length === 0)) {
                data.teams = req.user.teams.map(t => t._id || t);
            }
        }

        const contact = await Contact.create(data);

        // Sync to Google
        googleSyncQueue.add('syncContact', { contactId: contact._id }).catch(() => { });

        res.status(201).json({ success: true, data: contact });
    } catch (error) {
        console.error("[ERROR] createContact failed:", error);
        next(error);
    }
};

export const updateContact = async (req, res, next) => {
    try {
        console.log("[updateContact] Request Body:", JSON.stringify(req.body, null, 2));

        // 🛡️ Senior Professional: Pre-validation Data Normalization
        const flattenPopulatedRefs = (obj) => {
            if (!obj || typeof obj !== 'object' || obj instanceof mongoose.Types.ObjectId) return obj;
            if (Array.isArray(obj)) return obj.map(flattenPopulatedRefs);
            const newObj = { ...obj };
            const schemaContainers = ["phones", "emails", "personalAddress", "correspondenceAddress", "educations", "loans", "socialMedia", "incomes", "documents"];
            for (const key in newObj) {
                const val = newObj[key];
                if (val && typeof val === 'object' && !(val instanceof mongoose.Types.ObjectId)) {
                    if (val._id && !schemaContainers.includes(key)) {
                        newObj[key] = val._id;
                    } else {
                        newObj[key] = flattenPopulatedRefs(val);
                    }
                }
            }
            return newObj;
        };

        const updateData = flattenPopulatedRefs(req.body);
        
        // Strip internal fields
        const fieldsToStrip = ["_id", "id", "__v", "createdAt", "updatedAt", "fullName"];
        fieldsToStrip.forEach(field => delete updateData[field]);

        // Validate
        const { error, value: cleanData } = updateContactSchema.validate(updateData, { stripUnknown: true });
        if (error) {
            console.error("[updateContact] Validation Error:", JSON.stringify(error.details, null, 2));
            return res.status(400).json({ 
                success: false, 
                error: error.details[0].message,
                details: error.details 
            });
        }

        // Fetch existing contact to audit stage changes
        const existingContact = await Contact.findById(req.params.id).select('stage name surname').lean();

        // Resolve All Reference Fields
        const cleanEmptyStrings = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            for (const key in obj) {
                if (obj[key] === "") {
                    obj[key] = null;
                } else if (obj[key] && typeof obj[key] === 'object' && !(obj[key] instanceof mongoose.Types.ObjectId)) {
                    cleanEmptyStrings(obj[key]);
                }
            }
        };

        await resolveAllReferenceFields(cleanData);
        cleanEmptyStrings(cleanData);

        const visibilityFilter = await getVisibilityFilter(req.user);
        const contact = await Contact.findOneAndUpdate({ _id: req.params.id, ...visibilityFilter }, cleanData, { new: true, runValidators: true });
        if (!contact) return res.status(404).json({ success: false, error: "Contact not found or access denied" });

        // Sync to Google
        googleSyncQueue.add('syncContact', { contactId: contact._id }).catch(() => { });

        // Bidirectional Sync: Contact -> Inventory
        if (cleanData.documents && Array.isArray(cleanData.documents)) {
            const primaryPhone = contact.phones?.find(p => p.isPrimary)?.number || contact.phones?.[0]?.number;
            await syncDocumentsToInventory(cleanData.documents, { 
                name: contact.name, 
                mobile: primaryPhone 
            });
        }

        // Emit Stage Changed AuditLog if updated
        if (existingContact && cleanData.stage && String(existingContact.stage) !== String(cleanData.stage)) {
            // Need AuditLog module explicitly imported at top if not present.
            // Assuming AuditLog is imported at the top of contact.controller.js.
            const AuditLog = mongoose.model('AuditLog');
            await AuditLog.logEntityUpdate(
                'stage_changed',
                'contact',
                contact._id,
                `${contact.name} ${contact.surname || ''}`.trim(),
                req.user?.id || null, // Best effort actor
                { before: existingContact.stage || 'New', after: cleanData.stage },
                `Contact stage shifted from ${existingContact.stage || 'New'} to ${cleanData.stage}`
            );
        }

        res.json({ success: true, data: contact });
    } catch (error) {
        console.error("[ERROR] updateContact failed:", error);
        next(error);
    }
};

export const getContactUsage = async (req, res) => {
    try {
        const { id } = req.params;
        const contact = await Contact.findById(id);
        if (!contact) return res.status(404).json({ success: false, error: "Contact not found" });

        const mobile = contact.phones?.[0]?.number;
        const email = contact.emails?.[0]?.address;

        const [leadsCount, inventoryCount, bookingsCount, activitiesCount] = await Promise.all([
            Lead.countDocuments({ $or: [{ mobile }, { email }] }),
            Inventory.countDocuments({ $or: [{ owners: id }, { associates: id }] }),
            Booking.countDocuments({ $or: [{ lead: id }, { seller: id }, { channelPartner: id }] }),
            Activity.countDocuments({ $or: [{ entityId: id }, { 'relatedTo.id': id }] })
        ]);

        res.json({
            success: true,
            usage: {
                leads: leadsCount,
                inventory: inventoryCount,
                bookings: bookingsCount,
                activities: activitiesCount
            }
        });
    } catch (error) {
        console.error("getContactUsage error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Sync all unsynced contacts to Google
// @route   POST /api/contacts/sync-all
export const syncAllContacts = async (req, res) => {
    try {
        // Find contacts that don't have a googleContactId
        const contacts = await Contact.find({
            $or: [
                { googleContactId: { $exists: false } },
                { googleContactId: null },
                { googleContactId: "" }
            ]
        }).select('_id');
        
        console.log(`[ContactController] syncAllContacts: Found ${contacts.length} unsynced contacts.`);

        if (contacts.length === 0) {
            return res.json({ success: true, message: "All contacts are already synced with Google." });
        }

        // Add to queue
        contacts.forEach(contact => {
            googleSyncQueue.add('syncContact', { contactId: contact._id }).catch(() => { });
        });

        res.json({
            success: true,
            message: `Sync started for ${contacts.length} contacts in the background.`,
            count: contacts.length
        });
    } catch (error) {
        console.error("syncAllContacts error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteContact = async (req, res, next) => {
    try {
        const { id } = req.params;
        const contact = await Contact.findById(id);
        if (!contact) return res.status(404).json({ success: false, error: "Contact not found" });

        const mobile = contact.phones?.[0]?.number;
        const email = contact.emails?.[0]?.address;

        const contactId = new mongoose.Types.ObjectId(id);

        // Cascading Updates/Deletions
        await Promise.all([
            // Delete related Leads
            mobile || email ? Lead.deleteMany({ $or: [
                ...(mobile ? [{ mobile }] : []),
                ...(email ? [{ email }] : [])
            ] }) : Promise.resolve(),
            // Remove from Inventory owners/associates
            Inventory.updateMany({ owners: contactId }, { $pull: { owners: contactId } }),
            Inventory.updateMany({ "associates.contact": contactId }, { $pull: { associates: { contact: contactId } } }),
            // Null out in Bookings
            Booking.updateMany({ lead: contactId }, { $set: { lead: null } }),
            Booking.updateMany({ seller: contactId }, { $set: { seller: null } }),
            Booking.updateMany({ channelPartner: contactId }, { $set: { channelPartner: null } }),
            // Delete related Activities
            Activity.deleteMany({ $or: [{ entityId: id }, { 'relatedTo.id': id }] })
        ]);

        const visibilityFilter = await getVisibilityFilter(req.user);
        await Contact.findOneAndDelete({ _id: id, ...visibilityFilter });


        // Sync to Google
        if (contact.googleContactId) {
            googleSyncQueue.add('deleteContact', { googleContactId: contact.googleContactId }).catch(() => { });
        }

        res.json({ success: true, message: "Contact and all associated records deleted successfully" });
    } catch (error) {
        console.error("[ERROR] deleteContact failed:", error);
        next(error);
    }
};

export const bulkDeleteContacts = async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: "Invalid IDs provided" });
        }

        const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
        const contacts = await Contact.find({ _id: { $in: objectIds } });

        const mobiles = contacts.map(c => c.phones?.[0]?.number).filter(Boolean);
        const emails = contacts.map(c => c.emails?.[0]?.address).filter(Boolean);

        // Cascading Updates/Deletions
        await Promise.all([
            // Delete related Leads
            (mobiles.length > 0 || emails.length > 0) ? Lead.deleteMany({ $or: [
                ...(mobiles.length > 0 ? [{ mobile: { $in: mobiles } }] : []),
                ...(emails.length > 0 ? [{ email: { $in: emails } }] : [])
            ] }) : Promise.resolve(),
            // Remove from Inventory
            Inventory.updateMany({ owners: { $in: objectIds } }, { $pull: { owners: { $in: objectIds } } }),
            Inventory.updateMany({ "associates.contact": { $in: objectIds } }, { $pull: { associates: { contact: { $in: objectIds } } } }),
            // Null out in Bookings
            Booking.updateMany({ lead: { $in: objectIds } }, { $set: { lead: null } }),
            Booking.updateMany({ seller: { $in: objectIds } }, { $set: { seller: null } }),
            Booking.updateMany({ channelPartner: { $in: objectIds } }, { $set: { channelPartner: null } }),
            // Delete related Activities
            Activity.deleteMany({ $or: [{ entityId: { $in: objectIds } }, { 'relatedTo.id': { $in: objectIds } }] })
        ]);


        await Contact.deleteMany({ _id: { $in: objectIds } });

        // Sync to Google
        contacts.forEach(contact => {
            if (contact.googleContactId) {
                googleSyncQueue.add('deleteContact', { googleContactId: contact.googleContactId }).catch(() => { });
            }
        });

        res.json({ success: true, message: `${ids.length} contacts and associations deleted successfully` });
    } catch (error) {
        console.error("[ERROR] bulkDeleteContacts failed:", error);
        next(error);
    }
};

export const searchDuplicates = async (req, res, next) => {
    try {
        const { name, phone, email } = req.query;
        if (!name && !phone && !email) return res.status(200).json({ success: true, data: [] });

        // 1. Fetch Active Rules
        const activeRules = await DuplicationRule.find({ isActive: true });

        let query = {};

        if (activeRules.length > 0) {
            // 2. Build Query from Rules
            const ruleQueries = activeRules.map(rule => {
                const fieldQueries = rule.fields.map(field => {
                    if (field === 'name' && name) return { name: { $regex: name, $options: 'i' } };
                    if (field === 'phones.number' && phone) return { "phones.number": { $regex: phone, $options: 'i' } };
                    if (field === 'emails.address' && email) return { "emails.address": { $regex: email, $options: 'i' } };
                    return null;
                }).filter(Boolean);

                if (fieldQueries.length === 0) return null;
                return rule.matchType === 'all' ? { $and: fieldQueries } : { $or: fieldQueries };
            }).filter(Boolean);

            if (ruleQueries.length === 0) return res.status(200).json({ success: true, data: [] });
            query = { $or: ruleQueries };
        } else {
            // 3. Fallback to Default Logic (Any match)
            const cases = [];
            if (name && name.length > 2) cases.push({ name: { $regex: name, $options: 'i' } });
            if (phone && phone.length > 3) cases.push({ "phones.number": { $regex: phone, $options: 'i' } });
            if (email && email.length > 3) cases.push({ "emails.address": { $regex: email, $options: 'i' } });

            if (cases.length === 0) return res.status(200).json({ success: true, data: [] });
            query = { $or: cases };
        }

        const contacts = await Contact.find(query).limit(10).lean();
        res.status(200).json({ success: true, data: contacts });
    } catch (error) {
        console.error("[ERROR] searchDuplicates failed:", error);
        next(error);
    }
};

import Lookup from "../models/Lookup.js";

// Helper to resolve lookup (Find or Create)
// --- OPTIMIZATION 12: In-Memory Lookup Cache ---
const _lookupResolveCache = new Map();
const resolveLookup = async (type, value) => {
    if (!value) return null;

    // Handle populated object case
    if (typeof value === 'object' && value._id) {
        if (mongoose.Types.ObjectId.isValid(value._id)) return value._id;
    }

    if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value.toString());

    // Check Cache First
    const cacheKey = `${type}:${value}`;
    if (_lookupResolveCache.has(cacheKey)) return _lookupResolveCache.get(cacheKey);

    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: value });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }

    // Cache Result (LRU-style simple limit to 500 entries)
    if (_lookupResolveCache.size > 500) {
        const firstKey = _lookupResolveCache.keys().next().value;
        _lookupResolveCache.delete(firstKey);
    }
    _lookupResolveCache.set(cacheKey, lookup._id);

    return lookup._id;
};

// Helper to resolve User (By Name or Email)
import User from "../models/User.js";
const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const resolveUser = async (identifier) => {
    if (!identifier) return null;
    if (mongoose.Types.ObjectId.isValid(identifier)) return new mongoose.Types.ObjectId(identifier.toString());

    const escapedIdentifier = escapeRegExp(identifier);
    const user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } },
            { email: identifier.toLowerCase() }
        ]
    });
    return user ? user._id : null;
};

export const importContacts = async (req, res, next) => {
    try {
        const { data, updateDuplicates = false } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, message: "Invalid data provided" });
        }

        const bulkOps = [];
        const processedData = [];
        const errors = [];
        for (let i = 0; i < data.length; i++) {

            const item = data[i];
            try {
                const newItem = { ...item };

                // Resolve Lookups
                newItem.title = await resolveLookup('Title', item.title);
                newItem.professionCategory = await resolveLookup('ProfessionCategory', item.professionCategory);
                newItem.professionSubCategory = await resolveLookup('ProfessionSubCategory', item.professionSubCategory);
                newItem.designation = await resolveLookup('Designation', item.designation);
                newItem.source = await resolveLookup('Source', item.source);
                newItem.subSource = await resolveLookup('SubSource', item.subSource);
                newItem.campaign = await resolveLookup('Campaign', item.campaign);
                newItem.owner = await resolveUser(item.owner);

                if (item.assignedTo) {
                    if (!newItem.assignment) newItem.assignment = {};
                    newItem.assignment.assignedTo = await resolveUser(item.assignedTo);
                }
                newItem.status = item.status || 'Active';
                newItem.stage = item.stage || 'New';

                // Tag logic
                let currentTags = Array.isArray(item.tags) ? [...item.tags] :
                    (typeof item.tags === 'string' && item.tags.trim() ? item.tags.split(',').map(t => t.trim()) : []);
                if (!currentTags.includes('Import')) currentTags.push('Import');
                newItem.tags = currentTags;

                // Restructure phones (mobile as main key)
                const mobile = item.mobile || (item.phones && item.phones[0]?.number);
                if (mobile) {
                    newItem.phones = [{ number: mobile, type: 'Personal' }];
                    delete newItem.mobile;
                }

                // Restructure emails
                if (item.email) {
                    newItem.emails = [{ address: item.email, type: 'Personal' }];
                    delete newItem.email;
                }

                // Resolve Address
                const addressFields = ['hNo', 'street', 'area', 'city', 'tehsil', 'postOffice', 'state', 'country', 'pinCode', 'location'];
                newItem.personalAddress = {};
                if (item.country) newItem.personalAddress.country = await resolveLookup('Country', item.country);
                if (item.state) newItem.personalAddress.state = await resolveLookup('State', item.state);
                if (item.city) newItem.personalAddress.city = await resolveLookup('City', item.city);
                if (item.tehsil) newItem.personalAddress.tehsil = await resolveLookup('Tehsil', item.tehsil);
                if (item.postOffice) newItem.personalAddress.postOffice = await resolveLookup('PostOffice', item.postOffice);
                if (item.location) newItem.personalAddress.location = await resolveLookup('Location', item.location);

                addressFields.forEach(field => {
                    if (item[field] && !['country', 'state', 'city', 'tehsil', 'postOffice', 'location'].includes(field)) {
                        newItem.personalAddress[field] = item[field];
                    }
                    delete newItem[field];
                });

                // Clean empty fields
                const cleanObj = (obj) => {
                    for (const k in obj) {
                        if (typeof obj[k] === 'string' && obj[k].trim() === '') obj[k] = undefined;
                        else if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) cleanObj(obj[k]);
                    }
                };
                cleanObj(newItem);

                if (mobile) {
                    if (updateDuplicates) {
                        bulkOps.push({
                            updateOne: {
                                filter: { $or: [{ mobile: mobile }, { "phones.number": mobile }] },
                                update: { $set: newItem },
                                upsert: true
                            }
                        });
                    } else {
                        processedData.push(newItem);
                    }
                } else {
                    processedData.push(newItem);
                }
            } catch (err) {
                console.error(`[IMPORT] Error at row ${i + 1}:`, err);
                errors.push({
                    row: i + 1,
                    name: item.name || 'Unknown',
                    reason: err.message
                });
            }
        }


        let newCount = 0;
        let updatedCount = 0;

        if (bulkOps.length > 0) {
            const bulkResult = await Contact.bulkWrite(bulkOps, { ordered: false });
            // bulkResult.upsertedCount = new items created via upsert
            // bulkResult.modifiedCount = existing items updated
            newCount += bulkResult.upsertedCount;
            updatedCount += bulkResult.modifiedCount;
        }

        if (processedData.length > 0) {
            // For non-upsert path, we need to filter out duplicates manually if we are doing insertMany
            let dataToInsert = processedData;
            if (!updateDuplicates) {
                const mobiles = processedData.map(d => d.phones?.[0]?.number).filter(Boolean);
                const existing = await Contact.find({
                    $or: [{ mobile: { $in: mobiles } }, { "phones.number": { $in: mobiles } }]
                }, 'phones').lean();
                const existingMobiles = new Set();
                existing.forEach(e => {
                    if (e.mobile) existingMobiles.add(e.mobile);
                    if (e.phones) e.phones.forEach(p => existingMobiles.add(p.number));
                });
                dataToInsert = processedData.filter(d => !existingMobiles.has(d.phones?.[0]?.number));
            }

            if (dataToInsert.length > 0) {
                const insertResult = await Contact.insertMany(dataToInsert, { ordered: false });
                newCount += insertResult.length;

                // Sync to Google
                insertResult.forEach(contact => {
                    googleSyncQueue.add('syncContact', { contactId: contact._id }).catch(() => { });
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `Import processed. New: ${newCount}, Updated: ${updatedCount}. ${errors.length > 0 ? errors.length + ' failed.' : ''}`,
            successCount: newCount + updatedCount,
            newCount: newCount,
            updatedCount: updatedCount,
            errorCount: errors.length,
            errors
        });


    } catch (error) {
        console.error("Professional Import Error:", error);
        next(error);
    }
};

export const checkDuplicatesImport = async (req, res, next) => {
    try {
        const { mobiles } = req.body;
        if (!mobiles || !Array.isArray(mobiles)) return res.status(400).json({ success: false, message: "Invalid mobile numbers provided" });

        // Find existing contacts by mobile or phone number
        const duplicates = await Contact.find({
            $or: [
                { mobile: { $in: mobiles } },
                { "phones.number": { $in: mobiles } }
            ]
        }, 'mobile phones name surname').lean();

        const duplicateMobiles = new Set();
        duplicates.forEach(d => {
            if (d.mobile) duplicateMobiles.add(d.mobile);
            if (d.phones) d.phones.forEach(p => duplicateMobiles.add(p.number));
        });

        res.status(200).json({
            success: true,
            duplicates: Array.from(duplicateMobiles).filter(m => mobiles.includes(m))
        });
    } catch (error) {
        next(error);
    }
};
