import cron from 'node-cron';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Lookup from '../models/Lookup.js';
import AuditLog from '../models/AuditLog.js';

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
            // 1. Fetch Status Lookups for Stalled and Dormant
            const stalledLookup = await Lookup.findOne({ type: 'Status', lookup_value: { $regex: /^stalled$/i } }).lean();
            const dormantLookup = await Lookup.findOne({ type: 'Status', lookup_value: { $regex: /^dormant$/i } }).lean();

            if (!stalledLookup || !dormantLookup) {
                console.warn('[AgingCronService] Stalled or Dormant status lookups not found. Exiting sweep.');
                return;
            }

            // 2. Fetch all leads that are NOT already closed, stalled, or dormant
            const activeLeads = await Lead.find({
                status: { $nin: [stalledLookup._id, dormantLookup._id] }
            }).populate('stage', 'lookup_value').select('status stage stageChangedAt lastActivityAt createdAt').lean();

            let updatedCount = 0;
            const now = new Date();

            // 3. Process each lead
            for (const lead of activeLeads) {
                // Ignore Closed stages
                if (lead.stage && lead.stage.lookup_value && lead.stage.lookup_value.toLowerCase().includes('closed')) {
                    continue;
                }

                const lastActive = lead.lastActivityAt || lead.stageChangedAt || lead.createdAt;
                const daysSinceActivity = Math.floor((now - new Date(lastActive)) / (1000 * 60 * 60 * 24));

                let newStatusId = null;
                let reason = '';

                if (daysSinceActivity > 30) {
                    newStatusId = dormantLookup._id;
                    reason = `System Auto-Aging: No activity for ${daysSinceActivity} days. Marked as Dormant.`;
                } else if (daysSinceActivity > 14) {
                    newStatusId = stalledLookup._id;
                    reason = `System Auto-Aging: No activity for ${daysSinceActivity} days. Marked as Stalled.`;
                }

                // Apply update if threshold exceeded
                if (newStatusId && lead.status?.toString() !== newStatusId.toString()) {
                    await Lead.findByIdAndUpdate(lead._id, { status: newStatusId });
                    
                    // Log the change
                    await AuditLog.create({
                        entity: 'lead',
                        entityId: lead._id,
                        action: 'status_changed',
                        performedBy: null, // System
                        details: reason
                    }).catch(() => {}); // ignore audit log errors

                    updatedCount++;
                }
            }

            console.log(`[AgingCronService] Sweep complete. Auto-updated status for ${updatedCount} leads.`);

        } catch (err) {
            console.error('[AgingCronService] Pipeline sweep failed:', err.message);
        }
    }
}

export default new AgingCronService();
