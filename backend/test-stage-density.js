import { computeStageDensity } from '../src/utils/agingEngine.js';

const mockLeads = [
    { stage: 'Incoming', createdAt: new Date(Date.now() - 2 * 86400000) },
    { stage: 'Incoming', createdAt: new Date(Date.now() - 5 * 86400000) },
    { stage: 'Prospect', stageChangedAt: new Date(Date.now() - 10 * 86400000) },
    { stage: 'Opportunity', stageChangedAt: new Date(Date.now() - 30 * 86400000), agentName: 'Rahul' },
    { stage: 'Opportunity', stageChangedAt: new Date(Date.now() - 40 * 86400000), agentName: 'Amit' },
    { stage: 'Opportunity', stageChangedAt: new Date(Date.now() - 1 * 86400000) },
    { stage: 'Negotiation', stageChangedAt: new Date(Date.now() - 5 * 86400000) },
    { stage: 'Closed', stageChangedAt: new Date() }
];

const targets = {
    'Incoming': { targetDays: 3 },
    'Prospect': { targetDays: 7 },
    'Opportunity': { targetDays: 14 },
    'Negotiation': { targetDays: 7 },
    'Closed': { targetDays: 999 }
};

console.log(JSON.stringify(computeStageDensity(mockLeads, targets, 'leads'), null, 2));
