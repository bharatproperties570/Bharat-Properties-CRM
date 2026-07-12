import Deal from '../../models/Deal.js';
import Lead from '../../models/Lead.js';
import Lookup from '../../models/Lookup.js';
import SystemSetting from '../modules/systemSettings/system.model.js';
import AuditLog from '../../models/AuditLog.js';
import { createNotification } from '../../controllers/notification.controller.js';

class DealSyncEngine {
    async syncLeadToDeal(leadId, newStageName, triggeredByUserId = null) {
        try {
            console.log(`[DealSyncEngine] Evaluating sync for Lead: ${leadId} -> ${newStageName}`);
            
            // 1. Fetch Sync Rules
            let syncRules = [];
            const configDoc = await SystemSetting.findOne({ key: 'syncRules' }).lean();
            if (configDoc && configDoc.value) {
                syncRules = configDoc.value.filter(r => r.isActive);
            }

            if (syncRules.length === 0) return; // No active rules

            // 2. Find Matching Rule
            // Example rule: { conditionStage: 'Booked', dealStage: 'Booked', condition: 'ANY_LEAD' }
            const normalizedNewStage = (newStageName || '').toLowerCase().trim();
            
            const matchedRules = syncRules.filter(r => {
                const ruleStage = (r.conditionStage || '').toLowerCase().trim();
                return ruleStage === normalizedNewStage;
            });

            if (matchedRules.length === 0) return;

            // 3. Find Lead & Associated Deals
            const lead = await Lead.findById(leadId).lean();
            if (!lead) return;

            // We find deals directly linked via leadId, OR fallback to contact linkage if leadId isn't populated yet
            let deals = await Deal.find({ leadId: leadId });
            
            if (deals.length === 0 && lead.contactDetails) {
                deals = await Deal.find({
                    $or: [
                        { buyer: lead.contactDetails },
                        { associatedContact: lead.contactDetails }
                    ]
                });
                
                // Retroactively fix the linkage
                if (deals.length > 0) {
                    await Deal.updateMany(
                        { _id: { $in: deals.map(d => d._id) } },
                        { $set: { leadId: leadId } }
                    );
                }
            }

            if (deals.length === 0) {
                console.log(`[DealSyncEngine] No active deals found for Lead: ${leadId}. Sync skipped.`);
                return;
            }

            // 4. Apply Updates
            for (const rule of matchedRules) {
                const targetDealStageStr = rule.dealStage; // e.g. "Booked", "Closed Won", "Closed Lost"

                // We may need to resolve the stage ID if deals store stage as string or ObjectID.
                // In Deal.js: `stage: { type: mongoose.Schema.Types.Mixed }`
                // Let's resolve the lookup ID just in case.
                let targetStageVal = targetDealStageStr;
                const lookup = await Lookup.findOne({ lookup_type: { $regex: /^stage$/i }, lookup_value: { $regex: new RegExp(`^${targetDealStageStr}$`, 'i') } });
                if (lookup) {
                    targetStageVal = lookup.lookup_value; // Store as string (or lookup._id depending on Deal logic)
                    // Wait, Deal schema usually stores string or ObjectId. We will just save the string because Deal.js handles both.
                }

                console.log(`[DealSyncEngine] Rule matched (${rule.id}). Syncing ${deals.length} deal(s) to stage: ${targetStageVal}`);

                for (const deal of deals) {
                    const oldStage = deal.stage;
                    
                    // Prevent redundant updates
                    const currentStageStr = (typeof oldStage === 'object' && oldStage ? oldStage.lookup_value : oldStage) || '';
                    if (currentStageStr.toString().toLowerCase() === targetStageVal.toLowerCase()) {
                        continue; 
                    }

                    deal.stage = targetStageVal;
                    deal.stageChangedAt = new Date();
                    deal.stageSyncReason = `Auto-synced from Lead (Rule: ${rule.label})`;
                    
                    if (rule.dealReason) {
                        deal.status = rule.dealReason; // e.g. "Owner Withdrawn"
                    }

                    await deal.save();

                    // Audit Log for Deal
                    await AuditLog.logEntityUpdate(
                        'deal_synced',
                        'deal',
                        deal._id,
                        deal.projectName || 'Deal',
                        triggeredByUserId,
                        { fromStage: currentStageStr, toStage: targetStageVal, reason: deal.stageSyncReason },
                        `Deal stage auto-synced to ${targetStageVal} due to Lead transitioning to ${newStageName}.`
                    );
                    
                    // Notify Deal Owner
                    if (deal.owner) {
                        const ownerId = deal.owner._id || deal.owner;
                        if (ownerId.toString() !== (triggeredByUserId || '').toString()) {
                            await createNotification(
                                ownerId,
                                'system',
                                '🔄 Deal Auto-Synced',
                                `Deal for ${deal.projectName || 'client'} synced to ${targetStageVal} based on Lead stage change.`,
                                `/deals/${deal._id}`,
                                { dealId: deal._id }
                            );
                        }
                    }
                }
            }

        } catch (error) {
            console.error('[DealSyncEngine] Failed to sync Lead to Deal:', error);
        }
    }
}

export default new DealSyncEngine();
