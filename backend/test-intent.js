import { computeIntentScore } from './src/services/LeadHealthIntentHelper.js';

const config = {
    visitRepeat: { weight: 15, isActive: true },
    budgetGapPct: { weight: -10, isActive: true },
    whatsappResponse: { weight: 5, isActive: true },
};

const now = Date.now();
const tenDaysAgo = new Date(now - 10 * 86400000).toISOString();
const fortyDaysAgo = new Date(now - 40 * 86400000).toISOString();

// Scenario 1: Recent repeat visits, realistic budget, good whatsapp response
const lead1 = { budget_max: 5000000, deals: [{ price: 4800000 }] };
const acts1 = [
    { type: 'Site Visit', date: fortyDaysAgo },
    { type: 'Site Visit', date: tenDaysAgo }, // 10 days old -> decay factor ~0.87
    { type: 'WhatsApp', direction: 'outbound' },
    { type: 'WhatsApp', direction: 'outbound' },
    { type: 'WhatsApp', direction: 'outbound' },
    { type: 'WhatsApp', direction: 'outbound' },
    { type: 'WhatsApp', direction: 'inbound' },
    { type: 'WhatsApp', direction: 'inbound' },
    { type: 'WhatsApp', direction: 'inbound' }
];

// Scenario 2: Stale repeat visit, huge budget gap, ghosting on whatsapp
const lead2 = { budget_max: 5000000, deals: [{ price: 8000000 }] }; // 60% gap!
const acts2 = [
    { type: 'Site Visit', date: fortyDaysAgo },
    { type: 'Site Visit', date: fortyDaysAgo }, // > 30 days old -> decay factor 0
    { type: 'WhatsApp', direction: 'outbound' },
    { type: 'WhatsApp', direction: 'outbound' },
    { type: 'WhatsApp', direction: 'outbound' },
    { type: 'WhatsApp', direction: 'outbound' },
    { type: 'WhatsApp', direction: 'outbound' }
    // 0 inbound replies
];

console.log('Lead 1 (Good Intent) Score:', computeIntentScore(lead1, acts1, config));
console.log('Lead 2 (Bad Intent) Score:', computeIntentScore(lead2, acts2, config));
