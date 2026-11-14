import crypto from 'node:crypto';
import { normalizePhone } from './normalization.js';

export const OWNER_OUTREACH_FREQUENCIES = Object.freeze(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
export const OWNER_OUTREACH_BATCH_SIZES = Object.freeze([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1250, 1500, 1750, 2000]);

const valueOf = (value) => {
    if (value == null) return '';
    if (typeof value === 'object') return String(value.lookup_value || value.name || value.value || '');
    return String(value);
};

export function isLikelyBrokerContact(contact = {}) {
    const fields = [contact.professionCategory, contact.professionSubCategory, contact.designation, ...(contact.tags || [])];
    const text = fields.map(valueOf).join(' ').toLowerCase();
    return /(^|[^a-z])(broker|brokers|property dealer|real estate agent|estate agent|property agent)([^a-z]|$)/i.test(text);
}

export function normalizeEmail(value) {
    if (typeof value !== 'string') return '';
    const email = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function hashEndpoint(channel, endpoint) {
    const secret = process.env.OWNER_OUTREACH_HASH_SECRET || process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error('Owner outreach endpoint hashing secret is not configured');
    return crypto.createHmac('sha256', secret).update(`${channel}:${endpoint}`).digest('hex');
}

export function maskEndpoint(channel, endpoint) {
    if (channel === 'email') {
        const [local, domain] = endpoint.split('@');
        return `${local.slice(0, 1)}***@${domain}`;
    }
    return `${endpoint.slice(0, 3)}******${endpoint.slice(-2)}`;
}

export function buildOwnerOutreachAudience(inventoryItems, options = {}) {
    const includeOwners = options.includeOwners !== false;
    const includeAssociates = options.includeAssociates === true;
    const excludeBrokers = options.excludeBrokers !== false;
    const endpoints = new Map();
    const people = new Set();

    const addContact = (contact, inventory, relationship, relationType) => {
        if (!contact || !contact._id || (excludeBrokers && isLikelyBrokerContact(contact))) return;
        const contactId = String(contact._id);
        people.add(contactId);
        const inventoryId = String(inventory._id);
        const candidates = [];
        for (const item of (Array.isArray(contact.phones) ? contact.phones : [])) {
            const raw = item && typeof item === 'object' ? item.number : item;
            const normalized = normalizePhone(raw);
            if (normalized && normalized !== '-' && normalized.length >= 10 && !normalized.includes('@')) {
                const optOutIsCurrent = contact.whatsappOptOut === true || (contact.whatsappOptOutAt && (!contact.whatsappOptInAt || new Date(contact.whatsappOptOutAt) >= new Date(contact.whatsappOptInAt)));
                candidates.push({ channel: 'whatsapp', endpoint: normalized, consented: Boolean(contact.whatsappOptInAt) && !optOutIsCurrent, optedOut: Boolean(optOutIsCurrent) });
                candidates.push({ channel: 'sms', endpoint: normalized, consented: false, optedOut: false });
                candidates.push({ channel: 'rcs', endpoint: normalized, consented: false, optedOut: false });
            }
        }
        for (const item of (Array.isArray(contact.emails) ? contact.emails : [])) {
            const raw = item && typeof item === 'object' ? item.address : item;
            const normalized = normalizeEmail(raw);
            if (normalized) candidates.push({ channel: 'email', endpoint: normalized, consented: false, optedOut: false });
        }

        for (const candidate of candidates) {
            const endpointHash = hashEndpoint(candidate.channel, candidate.endpoint);
            const key = `${candidate.channel}:${endpointHash}`;
            const current = endpoints.get(key) || {
                channel: candidate.channel,
                endpointHash,
                maskedEndpoint: maskEndpoint(candidate.channel, candidate.endpoint),
                contactIds: new Set(),
                inventoryIds: new Set(),
                relationships: new Set(),
                consentState: candidate.optedOut ? 'OPTED_OUT' : (candidate.consented ? 'CONSENTED' : 'UNKNOWN'),
                eligibility: candidate.optedOut ? 'SUPPRESSED_OPTOUT' : (candidate.consented ? 'ELIGIBLE' : 'CONSENT_REQUIRED')
            };
            current.contactIds.add(contactId);
            current.inventoryIds.add(inventoryId);
            current.relationships.add(`${relationType}:${relationship || relationType}`);
            // A single endpoint may belong to several contacts. Preserve an
            // opt-out from any linked contact, but allow a later positive
            // consent record to upgrade an endpoint that was only unknown.
            if (candidate.optedOut) {
                current.consentState = 'OPTED_OUT';
                current.eligibility = 'SUPPRESSED_OPTOUT';
            } else if (candidate.consented && current.consentState !== 'OPTED_OUT') {
                current.consentState = 'CONSENTED';
                current.eligibility = 'ELIGIBLE';
            }
            endpoints.set(key, current);
        }
    };

    for (const inventory of inventoryItems || []) {
        if (includeOwners) for (const owner of inventory.owners || []) addContact(owner, inventory, 'Owner', 'OWNER');
        if (includeAssociates) {
            for (const associate of inventory.associates || []) {
                if (associate?.contact) addContact(associate.contact, inventory, valueOf(associate.relationship) || 'Associate', 'ASSOCIATE');
            }
        }
    }

    return {
        uniquePeople: people.size,
        endpoints: [...endpoints.values()].map((item) => ({
            ...item,
            contactIds: [...item.contactIds],
            inventoryIds: [...item.inventoryIds],
            relationships: [...item.relationships]
        }))
    };
}
