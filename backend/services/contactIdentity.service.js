import mongoose from 'mongoose';
import Contact from '../models/Contact.js';
import { normalizePhone } from '../utils/normalization.js';

/**
 * Enterprise Contact Identity Resolution Service
 * 
 * Safely resolves or creates a Contact identity according to Option C lifecycle rules.
 * Does NOT merge conflicting contacts automatically (returns conflict flag).
 * Enforces strict multi-tenant boundary isolation.
 * 
 * @param {Object} params
 * @param {String} params.mobile - Un-normalized mobile number from Lead
 * @param {String} params.email - Un-normalized email from Lead
 * @param {Object|String} params.tenantId - Tenant ObjectId or string
 * @param {Object} params.contactData - Data to initialize/update the contact with
 * @param {Object} params.session - Mongoose transaction session
 * @param {Boolean} params.createIfMissing - If true, creates a Contact if none exists.
 * @returns {Object} { success, contact, conflict, conflictDetails }
 */
export const resolveContactIdentity = async ({
    mobile,
    email,
    tenantId = null,
    contactData = {},
    session,
    createIfMissing = false
}) => {
    try {
        const normMobile = mobile ? normalizePhone(mobile) : null;
        const normEmail = email && String(email).trim() !== "" ? String(email).trim().toLowerCase() : null;

        if (!normMobile && !normEmail) {
            return { success: false, error: 'Cannot resolve identity without mobile or email.' };
        }

        // Determine effective tenantId
        const rawTenant = tenantId || contactData.tenantId;
        const effectiveTenantId = (rawTenant && mongoose.Types.ObjectId.isValid(rawTenant.toString()))
            ? new mongoose.Types.ObjectId(rawTenant.toString())
            : null;

        const tenantFilter = effectiveTenantId ? { tenantId: effectiveTenantId } : {};

        let contactByPhone = null;
        let contactByEmail = null;

        if (normMobile) {
            contactByPhone = await Contact.findOne({
                "phones.number": normMobile,
                isDeleted: { $ne: true },
                isMerged: { $ne: true },
                ...tenantFilter
            }).session(session);
        }

        if (normEmail && !contactByPhone) { // only query if phone didn't find one, or we want to detect conflicts
            contactByEmail = await Contact.findOne({
                "emails.address": normEmail,
                isDeleted: { $ne: true },
                isMerged: { $ne: true },
                ...tenantFilter
            }).session(session);
        }

        // Identity Conflict Check
        if (contactByPhone && contactByEmail && String(contactByPhone._id) !== String(contactByEmail._id)) {
            // Found two different active contacts matching the identity tokens within this tenant
            return {
                success: true,
                conflict: true,
                conflictDetails: { contactA: contactByPhone, contactB: contactByEmail },
                contact: contactByPhone // canonical fallback to phone
            };
        }

        let canonicalContact = contactByPhone || contactByEmail;

        if (canonicalContact) {
            // We found a safe canonical contact within the tenant.
            return { success: true, contact: canonicalContact, conflict: false };
        }

        if (createIfMissing) {
            // Atomic Upsert using $setOnInsert to prevent race conditions during creation
            const filter = normMobile 
                ? { "phones.number": normMobile, isDeleted: { $ne: true }, isMerged: { $ne: true }, ...tenantFilter }
                : { "emails.address": normEmail, isDeleted: { $ne: true }, isMerged: { $ne: true }, ...tenantFilter };

            const insertData = {
                name: contactData.name || 'Unknown',
                title: contactData.title || 'Mr.',
                phones: normMobile ? [{ number: normMobile, type: 'Personal' }] : [],
                emails: normEmail ? [{ address: normEmail, type: 'Personal' }] : [],
                tags: contactData.tags || [],
                description: contactData.description || `Created from Lead on ${new Date().toLocaleDateString('en-GB')}.`,
                source: contactData.source,
                subSource: contactData.subSource,
                campaign: contactData.campaign,
                assignedTo: contactData.assignedTo,
                owner: contactData.owner,
                teams: contactData.teams || [],
                department: contactData.department,
                requirement: contactData.requirement,
                budget: contactData.budget,
                location: contactData.location,
                personalAddress: contactData.personalAddress
            };

            if (effectiveTenantId) {
                insertData.tenantId = effectiveTenantId;
            }

            const upsertedContact = await Contact.findOneAndUpdate(
                filter,
                { $setOnInsert: insertData },
                { upsert: true, new: true, session }
            );

            return { success: true, contact: upsertedContact, conflict: false };
        }

        // Return gracefully if missing but createIfMissing is false
        return { success: true, contact: null, conflict: false };

    } catch (error) {
        console.error('[IdentityService] Error:', error);
        throw error;
    }
};

export default { resolveContactIdentity };
