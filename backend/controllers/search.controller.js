import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import Inventory from '../models/Inventory.js';
import Deal from '../models/Deal.js';
import mongoose from 'mongoose';

/**
 * GET /api/search?q=<term>&limit=5
 *
 * Returns:
 *   contacts — matched by name/phone/email OR linked as inventory owner/associate OR deal owner/buyer
 *   leads    — matched by firstName/lastName/mobile/email
 */
export const globalSearch = async (req, res) => {
    try {
        const { q = '', limit = 5 } = req.query;
        const term = q.trim();

        if (term.length < 2) {
            return res.json({ success: true, contacts: [], leads: [] });
        }

        const regex = new RegExp(term, 'i');
        const lim = Math.min(Number(limit) || 5, 20);

        // ── 1. Direct Contact search ─────────────────────────────────────────
        const directContactIds = await Contact.find({
            $or: [
                { name: regex },
                { 'phones.number': regex },
                { 'emails.address': regex },
                { description: regex }
            ]
        }).select('_id').lean().then(r => r.map(c => c._id.toString()));

        // ── 2. Contacts via Inventory ownership ──────────────────────────────
        // owners: [ ObjectId(Contact) ]
        // associates: [{ contact: ObjectId(Contact), relationship: String }]
        const invOwnerIds = await Inventory.find({
            $or: [
                { owners: { $exists: true, $not: { $size: 0 } } },
                { 'associates.contact': { $exists: true } }
            ]
        }).select('owners associates').lean().then(invs => {
            const ids = new Set();
            invs.forEach(inv => {
                (inv.owners || []).forEach(oid => ids.add(oid.toString()));
                (inv.associates || []).forEach(a => a?.contact && ids.add(a.contact.toString()));
            });
            return [...ids];
        });

        // ── 3. Contacts via Deal ownership ───────────────────────────────────
        // Deal.owner, Deal.associatedContact, Deal.partyStructure.owner, Deal.partyStructure.buyer
        const dealContactIds = await Deal.find({}).select('owner associatedContact partyStructure').lean().then(deals => {
            const ids = new Set();
            deals.forEach(d => {
                const candidates = [
                    d.owner,
                    d.associatedContact,
                    d.partyStructure?.owner,
                    d.partyStructure?.buyer,
                ];
                candidates.forEach(c => {
                    if (c && mongoose.Types.ObjectId.isValid(c)) ids.add(c.toString());
                });
            });
            return [...ids];
        });

        // ── 4. Merge all known contact ID pools whose NAME matches query ─────
        const allRelatedIds = [...new Set([...invOwnerIds, ...dealContactIds])]
            .filter(id => !directContactIds.includes(id))
            .map(id => new mongoose.Types.ObjectId(id));

        let relatedContacts = [];
        if (allRelatedIds.length > 0) {
            // We only want ones whose name/phone also matches the search term
            relatedContacts = await Contact.find({
                _id: { $in: allRelatedIds },
                $or: [
                    { name: regex },
                    { 'phones.number': regex },
                    { 'emails.address': regex }
                ]
            }).select('_id name phones emails').lean();
        }

        // ── 5. Full contact fetch for direct matches ─────────────────────────
        const directContacts = await Contact.find({
            $or: [
                { name: regex },
                { 'phones.number': regex },
                { 'emails.address': regex },
                { description: regex }
            ]
        }).select('_id name phones emails').limit(lim).lean();

        // Merge and deduplicate contacts
        const contactMap = new Map();
        [...directContacts, ...relatedContacts].forEach(c => contactMap.set(c._id.toString(), c));
        const contacts = [...contactMap.values()].slice(0, lim).map(c => ({
            _id: c._id,
            name: c.name || '',
            mobile: c.phones?.[0]?.number || '',
            email: c.emails?.[0]?.address || '',
            type: 'contact'
        }));

        // ── 6. Lead search ───────────────────────────────────────────────────
        const leads = await Lead.find({
            $or: [
                { firstName: regex },
                { lastName: regex },
                { mobile: regex },
                { email: regex }
            ]
        }).select('_id salutation firstName lastName mobile email').limit(lim).lean();

        const formattedLeads = leads.map(l => ({
            _id: l._id,
            salutation: l.salutation || '',
            firstName: l.firstName || '',
            lastName: l.lastName || '',
            name: [l.salutation, l.firstName, l.lastName].filter(Boolean).join(' '),
            mobile: l.mobile || '',
            email: l.email || '',
            type: 'lead'
        }));

        res.json({ success: true, contacts, leads: formattedLeads });
    } catch (err) {
        console.error('[Search] globalSearch error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
