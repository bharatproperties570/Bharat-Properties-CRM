import Lead from '../models/Lead.js';
import Inventory from '../models/Inventory.js';
import Deal from '../models/Deal.js';
import { createNotification } from '../controllers/notification.controller.js';
import mongoose from 'mongoose';

/**
 * Enterprise Discovery Service
 * Proactively finds leads for a specific inventory and notifies the agent.
 */
export const runProactiveDiscoveryForInventory = async (inventoryId) => {
    try {
        console.log(`[DISCOVERY_ENGINE] Starting discovery for Inventory: ${inventoryId}`);
        
        // 1. Fetch Inventory/Deal details
        const deal = await Deal.findOne({ inventoryId }).populate('inventoryId').lean();
        if (!deal) return;

        const inventory = deal.inventoryId;
        const agentId = deal.assignedTo || deal.owner;

        // 2. Fetch Active Leads (Broad Filter for Performance)
        // We only fetch leads that aren't closed and have matching requirements
        const activeLeads = await Lead.find({
            stage: { $nin: ['Closed', 'Cancelled', 'Closed Lost'] },
            isActive: { $ne: false }
        }).select('_id firstName lastName mobile requirement propertyType budgetMin budgetMax areaMin areaMax location owner').lean();

        console.log(`[DISCOVERY_ENGINE] Checking against ${activeLeads.length} active leads...`);

        // 3. Simulated Match Logic (Lightweight version of matchDeals)
        const discoveries = [];
        for (const lead of activeLeads) {
            // High-speed heuristic check
            const score = calculateHeuristicScore(lead, deal);
            
            if (score >= 80) {
                discoveries.push({
                    leadId: lead._id,
                    leadName: `${lead.firstName} ${lead.lastName || ''}`,
                    score,
                    assignedTo: lead.owner
                });
            }
        }

        console.log(`[DISCOVERY_ENGINE] Found ${discoveries.length} high-confidence matches.`);

        // 4. Trigger Notifications (SaaS Grade Proactivity)
        if (discoveries.length > 0) {
            // Notify Inventory Owner
            await createNotification(
                agentId,
                'system',
                '🚀 New Potential Leads Discovered',
                `Found ${discoveries.length} potential leads for your new property "${deal.projectName || 'this unit'}". Confidence: High (80%+)`,
                `/leads/match/${discoveries[0].leadId}`, // Link to the best match
                { inventoryId, discoveryCount: discoveries.length }
            ).catch(e => console.error("[DISCOVERY_NOTIF_ERROR]", e));

            // Optional: Notify Lead Owners (Decentralized Discovery)
            // In a large team, you might want to notify the lead owner that a new property matches their client.
        }

        return discoveries;
    } catch (error) {
        console.error("[DISCOVERY_ENGINE_ERROR]", error);
    }
};

/**
 * Lightweight Heuristic Matching
 * Designed for background processing (O(n) over leads)
 */
function calculateHeuristicScore(lead, deal) {
    let score = 0;
    
    // Requirement Type Match (Buy/Rent)
    const lReq = String(lead.requirement || "").toLowerCase();
    const dIntent = String(deal.intent || "").toLowerCase();
    if (lReq && dIntent && (lReq.includes(dIntent) || dIntent.includes(lReq))) score += 30;

    // Budget Check (±20% tolerance)
    const price = deal.price || deal.quotePrice || 0;
    const max = lead.budgetMax || Infinity;
    const min = lead.budgetMin || 0;
    if (price > 0 && price >= min * 0.8 && price <= max * 1.2) score += 30;

    // Location/Project Check
    const lLoc = String(lead.sector || lead.searchLocation || "").toLowerCase();
    const dLoc = String(deal.location || "").toLowerCase();
    if (lLoc && dLoc && (lLoc.includes(dLoc) || dLoc.includes(lLoc))) score += 40;

    return score;
}
