/**
 * matchingScheduler.js — Phase 4B: Scheduled Re-Match Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise-grade scheduled background job that runs nightly to:
 *   1. Find all active leads (not Closed/Lost/Junk)
 *   2. Check if any NEW deals were added in the last 48 hours
 *   3. Run a lightweight inverse match for each qualifying lead
 *   4. Notify assigned agents via in-app notification for new high-score matches
 *
 * Strategy: Uses setInterval (no Redis dependency) — safe with MockRedis mode.
 * Runs every 6 hours to surface new deals promptly. Respects system load by
 * processing leads in batches with async delay between batches.
 */

import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Lookup from '../models/Lookup.js';
import { createNotification } from '../controllers/notification.controller.js';

const BATCH_SIZE = 20;           // Leads processed per batch
const BATCH_DELAY_MS = 3000;     // 3s between batches to avoid DB overload
const INTERVAL_MS = 6 * 60 * 60 * 1000;  // Run every 6 hours
const NEW_DEAL_WINDOW_HOURS = 50; // Look for deals added in last 50 hours

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Lightweight match score for a single lead against a single deal.
 * Faster than the full engine — only budget + location signals.
 */
const quickMatchScore = (lead, deal) => {
    let score = 0;

    // Budget signal (50 pts max)
    const price = parseFloat(deal.price || deal.quotePrice) || 0;
    const lMin = parseFloat(lead.budgetMin) || 0;
    const lMax = parseFloat(lead.budgetMax) || 0;
    if (price > 0) {
        if (lMax > 0 && price >= lMin && price <= lMax) score += 50;
        else if (lMax > 0 && price >= lMin * 0.8 && price <= lMax * 1.25) score += 30;
        else if (lMax === 0) score += 20; // No max budget — still a candidate
    } else {
        score += 15; // Price TBA — don't disqualify
    }

    // Location signal (30 pts max)
    const dealProj = (deal.projectName || '').toLowerCase();
    const dealSector = (deal.inventoryId?.sector || deal.sector || '').toLowerCase();
    const leadSector = (lead.sector || '').toLowerCase();
    const leadCity = (lead.locCity || '').toLowerCase();
    const leadArea = (lead.locArea || '').toLowerCase();
    const leadProjects = (Array.isArray(lead.projectName) ? lead.projectName : [])
        .map(p => String(p || '').toLowerCase()).filter(Boolean);

    if (leadProjects.some(p => p && dealProj.includes(p))) score += 30;
    else if (leadSector && dealSector && dealSector.includes(leadSector)) score += 25;
    else if (leadCity && dealProj.includes(leadCity)) score += 20;
    else if (leadArea && (dealSector.includes(leadArea) || dealProj.includes(leadArea))) score += 15;

    // Intent signal (20 pts max)
    const dealIntent = String(deal.intent?.lookup_value || deal.intent || '').toLowerCase();
    const leadReq = String(lead.requirement?.lookup_value || lead.requirement || '').toLowerCase();
    if (!dealIntent || !leadReq) score += 10; // No conflict — pass through
    else if (
        (dealIntent.includes('sell') && leadReq.includes('buy')) ||
        (dealIntent.includes('rent') && leadReq.includes('rent')) ||
        dealIntent.includes(leadReq) || leadReq.includes(dealIntent)
    ) score += 20;
    else score -= 20; // Intent mismatch — penalize

    return Math.max(0, score);
};

/**
 * Process a single batch of leads against new deals.
 */
const processBatch = async (leads, newDeals, processedPairs, notifiedCount) => {
    for (const lead of leads) {
        let bestScore = 0;
        let bestDeal = null;

        for (const deal of newDeals) {
            const pairKey = `${lead._id}_${deal._id}`;
            if (processedPairs.has(pairKey)) continue;

            const score = quickMatchScore(lead, deal);
            processedPairs.add(pairKey);

            if (score > bestScore) {
                bestScore = score;
                bestDeal = deal;
            }
        }

        // Only notify for meaningful matches (score >= 60/100)
        if (bestDeal && bestScore >= 60) {
            const agentId = lead.assignment?.assignedTo;
            if (!agentId) continue;

            const price = parseFloat(bestDeal.price || bestDeal.quotePrice) || 0;
            const priceStr = price > 0 ? `₹${(price / 100000).toFixed(1)}L` : 'Price TBA';

            try {
                await createNotification({
                    userId: agentId,
                    type: 'scheduled_match',
                    title: '🔄 New Deal Matches Your Lead',
                    message: `${bestDeal.projectName || 'New listing'} (${priceStr}) matches ${lead.firstName} ${lead.lastName || ''}'s requirements with a ${bestScore}% match score.`,
                    entityType: 'deal',
                    entityId: bestDeal._id,
                    link: `/leads/${lead._id}?tab=match`,
                    metadata: {
                        leadId: lead._id,
                        dealId: bestDeal._id,
                        score: bestScore,
                        source: 'scheduled_rematch'
                    }
                });
                notifiedCount.count++;
            } catch (err) {
                console.warn(`[MatchScheduler] Failed to notify agent ${agentId}: ${err.message}`);
            }
        }
    }
};

/**
 * Main re-match runner — called on schedule.
 */
const runScheduledRematch = async () => {
    const startTime = Date.now();
    console.log('[MatchScheduler] ▶ Nightly re-match job started');

    try {
        // 1. Find deals created in the last window
        const since = new Date(Date.now() - NEW_DEAL_WINDOW_HOURS * 60 * 60 * 1000);
        const newDeals = await Deal.find({
            createdAt: { $gte: since },
            stage: { $nin: ['Cancelled', 'Closed Lost', 'Sold Out'] },
            isVisible: { $ne: false }
        })
        .populate('inventoryId', 'sector block unitNo size')
        .lean();

        if (newDeals.length === 0) {
            console.log('[MatchScheduler] No new deals in the last window. Skipping.');
            return;
        }
        console.log(`[MatchScheduler] Found ${newDeals.length} new deal(s) to match against active leads`);

        // 2. Find active leads (only those with some matching data set)
        const activeLeads = await Lead.find({
            stage: { $nin: ['Closed', 'Lost', 'Junk', 'Unqualified'] },
            $or: [
                { budgetMin: { $gt: 0 } },
                { budgetMax: { $gt: 0 } },
                { sector: { $exists: true, $ne: '' } },
                { locCity: { $exists: true, $ne: '' } },
                { projectName: { $exists: true, $not: { $size: 0 } } }
            ]
        })
        .select('_id firstName lastName budgetMin budgetMax sector locCity locArea projectName requirement intent_tags assignment')
        .lean();

        console.log(`[MatchScheduler] Processing ${activeLeads.length} active leads in batches of ${BATCH_SIZE}`);

        const processedPairs = new Set();
        const notifiedCount = { count: 0 };

        // 3. Process in batches
        for (let i = 0; i < activeLeads.length; i += BATCH_SIZE) {
            const batch = activeLeads.slice(i, i + BATCH_SIZE);
            await processBatch(batch, newDeals, processedPairs, notifiedCount);

            if (i + BATCH_SIZE < activeLeads.length) {
                await sleep(BATCH_DELAY_MS);
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[MatchScheduler] ✅ Complete — ${notifiedCount.count} agents notified in ${duration}s`);

    } catch (err) {
        console.error('[MatchScheduler] ❌ Job failed:', err.message);
    }
};

/**
 * Initialize the scheduler.
 * Called once at server startup from server.js.
 */
export const initMatchingScheduler = () => {
    console.log(`[MatchScheduler] Initialized — will run every ${INTERVAL_MS / 3600000}h`);

    // Run immediately on startup (with 30s delay to let DB settle)
    const startupTimeout = setTimeout(() => {
        runScheduledRematch().catch(err =>
            console.error('[MatchScheduler] Startup run failed:', err.message)
        );
    }, 30 * 1000);

    // Then run on the regular interval
    const interval = setInterval(() => {
        runScheduledRematch().catch(err =>
            console.error('[MatchScheduler] Interval run failed:', err.message)
        );
    }, INTERVAL_MS);

    // Expose for graceful shutdown
    return { interval, startupTimeout };
};

export { runScheduledRematch };
