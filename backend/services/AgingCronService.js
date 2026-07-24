import cron from 'node-cron';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Lookup from '../models/Lookup.js';
import AuditLog from '../models/AuditLog.js';
import SystemSetting from '../models/SystemSetting.js';

class AgingCronService {
    /**
     * Initializes the cron job to run daily at midnight.
     */
    init() {
        console.log('[AgingCronService] Initializing Pipeline Auto-Aging Cron...');
        
        // Run daily at midnight (00:00)
        cron.schedule('0 0 * * *', async () => {
            console.log('[AgingCronService] Running daily stall/dormant sweep...');
            await this.sweepPipeline();
        });

        // Uncomment for testing immediately on startup
        // setTimeout(() => this.sweepPipeline(), 5000);
    }

    /**
     * Performs a sweep of the entire pipeline to find and flag stale leads/deals.
     */
    async sweepPipeline() {
        try {
            // 1. Fetch Status Lookups
            const stalledLookup = await Lookup.findOne({ lookup_type: { $regex: /^Status$/i }, lookup_value: { $regex: /^stalled$/i } }).lean();
            const dormantLookup = await Lookup.findOne({ lookup_type: { $regex: /^Status$/i }, lookup_value: { $regex: /^dormant$/i } }).lean();
            const atRiskLookup = await Lookup.findOne({ lookup_type: { $regex: /^Status$/i }, lookup_value: { $regex: /^at risk$/i } }).lean();

            if (!stalledLookup || !dormantLookup) {
                console.warn('[AgingCronService] Stalled or Dormant status lookups not found. Exiting sweep.');
                return;
            }

            // 2. Fetch all active leads
            const activeLeads = await Lead.find({
                status: { $nin: [stalledLookup._id, dormantLookup._id] }
            }).populate('stage', 'lookup_value').select('status stage stageChangedAt lastActivityAt createdAt consecutiveFailedContacts isAtRisk lastFailedContactAt').lean();

            let stalledCount = 0;
            let atRiskCount = 0;
            const now = new Date();

            // ── Stage-aware At-Risk thresholds (Enterprise Pipedrive style) ──────────
            // Higher stages = shorter patience window (more expensive leads)
            const AT_RISK_DAYS_BY_STAGE = {
                'incoming': 21,
                'prospect': 14,
                'opportunity': 10,
                'negotiation': 7,  // If a Negotiation lead goes dark for 7 days → CRITICAL
                'default': 14
            };

            for (const lead of activeLeads) {
                const stageStr = (lead.stage?.lookup_value || '').toLowerCase();

                // Skip terminal stages
                if (stageStr.includes('closed') || stageStr.includes('booked') || stageStr.includes('unqualified') || stageStr.includes('lost') || stageStr.includes('junk')) continue;

                const lastActive = lead.lastActivityAt || lead.stageChangedAt || lead.createdAt;
                const daysSinceActivity = Math.floor((now - new Date(lastActive)) / (1000 * 60 * 60 * 24));

                // ── 1. Standard Time-Based Stalled / Dormant ────────────────────────
                let newStatusId = null;
                let reason = '';

                if (daysSinceActivity > 30) {
                    newStatusId = dormantLookup._id;
                    reason = `System Auto-Aging: No activity for ${daysSinceActivity} days. Marked as Dormant.`;
                } else if (daysSinceActivity > 14) {
                    newStatusId = stalledLookup._id;
                    reason = `System Auto-Aging: No activity for ${daysSinceActivity} days. Marked as Stalled.`;
                }

                if (newStatusId && lead.status?.toString() !== newStatusId.toString()) {
                    await Lead.findByIdAndUpdate(lead._id, { status: newStatusId });
                    await AuditLog.create({
                        entity: 'lead', entityId: lead._id,
                        action: 'status_changed', performedBy: null, details: reason
                    }).catch(() => {});
                    stalledCount++;
                }

                // ── 2. Stage-Aware At-Risk Sweep (NEW — HubSpot Deal Rotting) ──────
                // Check leads in high-value stages that have gone silent beyond their threshold
                if (['opportunity', 'negotiation'].some(s => stageStr.includes(s)) && atRiskLookup) {
                    const atRiskDays = AT_RISK_DAYS_BY_STAGE[stageStr] || AT_RISK_DAYS_BY_STAGE['default'];

                    if (daysSinceActivity >= atRiskDays && !lead.isAtRisk) {
                        const atRiskReason = `Stage: ${lead.stage?.lookup_value} — No positive activity for ${daysSinceActivity} days (threshold: ${atRiskDays} days)`;
                        await Lead.findByIdAndUpdate(lead._id, {
                            $set: {
                                isAtRisk: true,
                                atRiskSince: new Date(),
                                atRiskReason: atRiskReason,
                                status: atRiskLookup._id
                            }
                        });
                        await AuditLog.create({
                            entity: 'lead', entityId: lead._id,
                            action: 'at_risk_flagged', performedBy: null,
                            details: `[AgingCron] ${atRiskReason}`
                        }).catch(() => {});
                        atRiskCount++;
                    }
                }
            }

            // ── 3. [ENTERPRISE] Cold Storage Archiver ────────────────────────
            let coldStorageDays = 365;
            const coldStorageSetting = await SystemSetting.findOne({ key: 'crm_cold_storage_days' }).lean();
            if (coldStorageSetting && coldStorageSetting.value) {
                coldStorageDays = parseInt(coldStorageSetting.value, 10) || 365;
            }

            const oneYearAgo = new Date();
            oneYearAgo.setDate(oneYearAgo.getDate() - coldStorageDays);
            
            // Find Terminal Stages
            const terminalStageLookups = await Lookup.find({ lookup_type: { $regex: /^Stage$/i }, lookup_value: { $regex: /closed|lost|won|unqualified|junk/i } }).lean();
            const terminalStageIds = terminalStageLookups.map(l => l._id);
            
            if (terminalStageIds.length > 0) {
                const archiveResult = await Lead.updateMany(
                    {
                        stage: { $in: terminalStageIds },
                        stageChangedAt: { $lte: oneYearAgo },
                        isArchived: { $ne: true }
                    },
                    { $set: { isArchived: true } }
                );
                console.log(`[AgingCronService] Cold Storage Archiver: Moved ${archiveResult.modifiedCount} old terminal leads to archive.`);
            }

            console.log(`[AgingCronService] Sweep complete. Stalled/Dormant: ${stalledCount}, At Risk (stage-aware): ${atRiskCount}`);

        } catch (err) {
            console.error('[AgingCronService] Pipeline sweep failed:', err.message);
        }
    }
}

export default new AgingCronService();
