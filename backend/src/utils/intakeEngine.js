import mongoose from 'mongoose';
import Project from '../../models/Project.js';
import Lead, { resolveLeadLookup } from '../../models/Lead.js';
import Inventory from '../../models/Inventory.js';
import Deal from '../../models/Deal.js';
import Contact from '../../models/Contact.js';
import Activity from '../../models/Activity.js';
import { normalizePhone } from '../utils/normalization.js';

/**
 * Enterprise Grade Intake Engine
 * Specialized in Intent Analysis for Buyer/Seller differentiation.
 */

// Intent Signals
const BUYER_SIGNALS = ['buy', 'price of', 'available', 'booking', 'interested', 'visit', 'site visit', 'location of', 'cost', 'chahiye', 'rate', 'bhk', 'sqyd', 'sq.yd', 'price', 'plan', 'brochure'];
const SELLER_SIGNALS = ['sell', 'resale', 'my unit', 'my flat', 'my plot', 'my house', 'offering', 'listing', 'owner', 'bechna', 'bikau', 'available for sale', 'for sale', 'plot for sale', 'mere pass'];

// Extraction Regex
const UNIT_REGEX = /(?:unit|flat|plot|shop|house|h\.no|hno|plot no|flat no)\s*(?:\#|\:|\-)?\s*([a-z0-9\-]+)/i;
const PRICE_REGEX = /(?:price|rate|budget|cost|offering|asking|value|demand)\s*(?:is|of|around|at)?\s*(?:rs\.?|inr)?\s*(\d+(?:\.\d+)?\s*(?:cr|l|k|lac|lakh|thousand|hundred)?)/i;

/**
 * Parses human-readable price to number
 */
const parsePrice = (priceStr) => {
    if (!priceStr) return 0;
    const cleanStr = priceStr.toLowerCase().replace(/rs\.?|inr|,/g, '').trim();
    const num = parseFloat(cleanStr);
    const unit = cleanStr.match(/[a-z]+/)?.[0];

    if (unit === 'cr') return num * 10000000;
    if (unit === 'l' || unit === 'lac' || unit === 'lakh') return num * 100000;
    if (unit === 'k' || unit === 'thousand') return num * 1000;
    return num;
};

/**
 * Detects intent from message text
 */
const detectIntent = (text, entities) => {
    const lower = text.toLowerCase();
    
    // 1. Explicit Seller Signals
    const hasSellerKeywords = SELLER_SIGNALS.some(s => lower.includes(s));
    const hasInventoryIdentifiers = entities.project && entities.unitNumber;
    
    // If they give a specific Unit + Project, we treat as Inventory/Seller intent
    if (hasSellerKeywords || hasInventoryIdentifiers) return 'SELLER';
    
    // 2. Explicit Buyer Signals
    const hasBuyerKeywords = BUYER_SIGNALS.some(s => lower.includes(s));
    if (hasBuyerKeywords) return 'BUYER';

    return 'UNKNOWN';
};

/**
 * Extracts entities (Project, Unit, Price) from text
 */
const extractEntities = async (text) => {
    const lower = text.toLowerCase();
    
    // 1. Project Detection (Look up projects in DB)
    const projects = await Project.find({}).select('name').lean();
    let detectedProject = null;
    for (const p of projects) {
        const pName = p.name.toLowerCase();
        const regex = new RegExp(`\\b${pName}\\b`, 'i');
        if (regex.test(text)) {
            detectedProject = p;
            break;
        }
    }

    // 2. Unit Detection
    const unitMatch = text.match(UNIT_REGEX);
    const unitNumber = unitMatch ? unitMatch[1] : null;

    // 3. Price Detection
    const priceMatch = text.match(PRICE_REGEX);
    const rawPrice = priceMatch ? priceMatch[1] : null;
    const parsedPrice = parsePrice(rawPrice);

    return {
        project: detectedProject,
        unitNumber,
        price: parsedPrice,
        rawPrice
    };
};

/**
 * Main Intake Processor
 */
export const processIntake = async ({ mobile, name, email, message, source = 'WhatsApp' }) => {
    const entities = await extractEntities(message);
    const intent = detectIntent(message, entities);
    const normalizedMobile = normalizePhone(mobile);

    console.log(`[IntakeEngine] 🧠 Intent: ${intent} | Entities: Project=${entities.project?.name}, Unit=${entities.unitNumber}, Price=${entities.price}`);

    // Resolve Identity
    let lead = await Lead.findOne({ mobile: normalizedMobile });
    let contact = await Contact.findOne({ 'phones.number': normalizedMobile });

    // SCENARIO A: Seller Intent (Inventory Update)
    if (intent === 'SELLER' && entities.project && entities.unitNumber) {
        let inventory = await Inventory.findOne({ 
            projectId: entities.project._id, 
            $or: [{ unitNumber: entities.unitNumber }, { unitNo: entities.unitNumber }]
        });

        if (!inventory) {
            inventory = new Inventory({
                projectId: entities.project._id,
                projectName: entities.project.name,
                unitNumber: entities.unitNumber,
                unitNo: entities.unitNumber,
                status: 'Available',
                intent: ['For Sale']
            });
        }

        if (contact && !inventory.owners.includes(contact._id)) {
            inventory.owners.push(contact._id);
        } else if (lead && !contact) {
            contact = await Contact.create({
                name: lead.firstName,
                surname: lead.lastName,
                phones: [{ number: normalizedMobile, type: 'Mobile', primary: true }],
                emails: lead.email ? [{ address: lead.email, type: 'Personal', primary: true }] : [],
                source: 'Auto-Promoted from Lead'
            });
            inventory.owners.push(contact._id);
        }

        if (entities.price > 0) {
            inventory.price = { value: entities.price, currency: 'INR' };
        }

        await inventory.save();

        if (entities.price > 0) {
            const deal = await Deal.create({
                name: `Resale: ${entities.project.name} - ${entities.unitNumber}`,
                inventory: inventory._id,
                price: entities.price,
                stage: await resolveLeadLookup('DealStage', 'New'),
                source: await resolveLeadLookup('Source', source),
                contact: contact?._id || null,
                remarks: `Auto-created via Enterprise Intake Engine. Detected Price: ${entities.rawPrice}`
            });
            return { type: 'DEAL', data: deal, inventory };
        }

        return { type: 'INVENTORY', data: inventory };
    }

    // SCENARIO B: Buyer Intent (Lead Creation)
    if (intent === 'BUYER') {
        if (!lead && !contact) {
            const [firstName, ...rest] = (name || 'Unknown').split(' ');
            lead = await Lead.create({
                firstName,
                lastName: rest.join(' ') || 'User',
                mobile: normalizedMobile,
                email: email || undefined,
                source: await resolveLeadLookup('Source', source),
                status: await resolveLeadLookup('Status', 'New'),
                description: message,
                intent_index: 60
            });

            const { distributeEntity } = await import('./distributionEngine.js');
            await distributeEntity(lead, `on${source}Capture`);
            return { type: 'LEAD', data: lead };
        }
    }

    // SCENARIO C: Unknown or Passive
    console.log(`[IntakeEngine] ℹ️ Unknown or Passive intent. No auto-creation performed.`);
    return { type: 'PASSIVE', message: 'No action taken' };
};

export default { processIntake };
