import Lead from '../../models/Lead.js';
import { createNotification } from '../../controllers/notification.controller.js';
import smsService from '../modules/sms/sms.service.js';
import AuditLog from '../../models/AuditLog.js';
import User from '../../models/User.js';
import { runFullLeadEnrichment } from '../utils/enrichmentEngine.js';

class RevivalSyncService {
    /**
     * Process automated actions for a revived lead
     * @param {string} leadId 
     * @param {string} triggeredByUserId 
     */
    async processRevivalActions(leadId, triggeredByUserId) {
        try {
            console.log(`[RevivalSync] Processing automated actions for Lead: ${leadId}`);

            const lead = await Lead.findById(leadId).populate('assignedTo').lean();
            if (!lead) return;

            // 1. Send External Notification (SMS/WhatsApp)
            await this._sendExternalWelcome(lead);

            // 2. Send Internal Alerts (Notifications to RM/TL)
            await this._sendInternalAlerts(lead, triggeredByUserId);

            // 3. Trigger Automatic Enrichment
            await this._triggerAutoEnrichment(leadId);

            // 4. Log Audit Event
            await AuditLog.logEntityUpdate(
                'lead_revived_automation',
                'lead',
                leadId,
                `${lead.firstName} ${lead.lastName || ''}`.trim(),
                triggeredByUserId,
                { status: 'Automated Notifications Triggered' },
                `Automated re-engagement notifications sent for revived lead.`
            );

        } catch (error) {
            console.error('[RevivalSync] Failed to process revival actions:', error.message);
        }
    }

    async _sendExternalWelcome(lead) {
        try {
            const phone = lead.mobile;
            if (!phone) return;

            console.log(`[RevivalSync] Sending welcome back SMS to ${phone}`);
            
            await smsService.sendSMSWithTemplate(
                phone, 
                "Lead Revival Welcome", 
                { Name: lead.firstName || 'Client' }, 
                { entityType: 'Lead', entityId: lead._id }
            );
        } catch (err) {
            console.warn('[RevivalSync] SMS sending failed:', err.message);
        }
    }

    async _sendInternalAlerts(lead, triggeredByUserId) {
        try {
            const rmId = lead.assignedTo?._id || lead.assignedTo;
            const rmName = lead.assignedTo?.fullName || lead.assignedTo?.name || 'Assigned RM';

            // Alert the RM
            if (rmId) {
                await createNotification(
                    rmId,
                    'announcement',
                    '🔥 Lead Revived!',
                    `Your dormant lead ${lead.firstName} ${lead.lastName || ''} has been revived and is now a Prospect.`,
                    `/leads/${lead._id}`,
                    { leadId: lead._id, type: 'revival' }
                );
            }

            // Alert the Team Lead if lead belongs to a team
            const teamId = lead.teams?.[0] || lead.assignment?.team;
            if (teamId) {
                // Find team lead (simple lookup for this implementation)
                const teamLead = await User.findOne({ 
                    $or: [{ team: teamId }, { teams: teamId }], 
                    role: { $regex: /manager|lead|admin/i } 
                }).select('_id').lean();

                if (teamLead && teamLead._id.toString() !== rmId?.toString()) {
                    await createNotification(
                        teamLead._id,
                        'system',
                        '📈 Revival Alert',
                        `${rmName} has successfully revived lead ${lead.firstName} from Dormant state.`,
                        `/leads/${lead._id}`,
                        { leadId: lead._id, type: 'revival_manager' }
                    );
                }
            }
        } catch (err) {
            console.warn('[RevivalSync] Internal alerts failed:', err.message);
        }
    }

    async _triggerAutoEnrichment(leadId) {
        try {
            console.log(`[RevivalSync] Triggering auto-enrichment for Lead: ${leadId}`);
            await runFullLeadEnrichment(leadId);
        } catch (err) {
            console.warn('[RevivalSync] Enrichment failed:', err.message);
        }
    }
}

export default new RevivalSyncService();
