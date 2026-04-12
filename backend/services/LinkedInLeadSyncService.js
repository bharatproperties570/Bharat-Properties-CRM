import linkedInService from './LinkedInService.js';
import Lead from '../models/Lead.js';
import Lookup from '../models/Lookup.js';
import axios from 'axios';

/**
 * LinkedInLeadSyncService.js
 * Bridges the gap between LinkedIn Lead Gen Forms and CRM Lead Database.
 */
class LinkedInLeadSyncService {
    
    /**
     * Perform a full sync of all leads from linked ad accounts
     */
    async syncAllLeads() {
        console.log('[LinkedInSync] Starting full lead sync...');
        const accounts = await linkedInService.getAdAccounts();
        
        let totalSynced = 0;
        for (const account of accounts) {
            const synced = await this.syncAccountLeads(account.id);
            totalSynced += synced;
        }

        return totalSynced;
    }

    /**
     * Sync leads for a specific Ad Account
     */
    async syncAccountLeads(adAccountUrn) {
        try {
            const token = await linkedInService.getAccessToken();
            const accountId = adAccountUrn.split(':').pop();

            // 1. Get Forms
            const formsRes = await axios.get(`https://api.linkedin.com/v2/adAccounts/${accountId}/leadGenForms?q=adAccount`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            let syncedCount = 0;
            for (const form of formsRes.data.elements) {
                // 2. Get Lead Submissions for this form
                // Note: In production, use since_time to only get new leads
                const leadsRes = await axios.get(`https://api.linkedin.com/v2/adFormResponses?q=leadGenForm&leadGenForm=${form.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                for (const liLead of leadsRes.data.elements) {
                    const saved = await this.processLinkedInLead(liLead, form);
                    if (saved) syncedCount++;
                }
            }

            return syncedCount;
        } catch (error) {
            console.error(`[LinkedInSync] Error syncing account ${adAccountUrn}:`, error.message);
            return 0;
        }
    }

    /**
     * Map and Save a single LinkedIn Lead
     */
    async processLinkedInLead(liLead, form) {
        try {
            const answers = liLead.formResponseValues || [];
            
            // Extract standard fields
            const email = this._getAnswer(answers, 'EMAIL');
            const mobile = this._getAnswer(answers, 'PHONE_NUMBER');
            const firstName = this._getAnswer(answers, 'FIRST_NAME') || 'LinkedIn';
            const lastName = this._getAnswer(answers, 'LAST_NAME') || 'Lead';

            if (!mobile && !email) return false;

            // Resolve LinkedIn Source Lookup
            let sourceId = null;
            const sourceLookup = await Lookup.findOne({ lookup_type: 'Source', lookup_value: 'LinkedIn' });
            sourceId = sourceLookup ? sourceLookup._id : null;

            // Create payload
            const leadData = {
                firstName,
                lastName,
                mobile: mobile || email, // Fallback if mobile missing
                email,
                source: sourceId,
                description: `LinkedIn Lead Gen Form: ${form.name || 'Untitled Form'}\nSubmitted at: ${new Date(liLead.submittedAt).toLocaleString()}`,
                source_meta: {
                    linkedin_form_id: form.id,
                    linkedin_lead_id: liLead.id,
                    linkedin_form_name: form.name
                }
            };

            // Use the Lead model for saving (this triggers the pre-save merge logic)
            const lead = new Lead(leadData);
            await lead.save().catch(err => {
                // Catch duplicate errors if merge logic didn't catch it
                if (err.name === 'MongoError' && err.code === 11000) return null;
                throw err;
            });

            return true;
        } catch (error) {
            if (error.isDuplicateMerge) return true; // Already merged correctly
            console.error('[LinkedInSync] Lead process error:', error.message);
            return false;
        }
    }

    _getAnswer(answers, fieldName) {
        const ans = answers.find(a => a.formFieldTag === fieldName || a.standardType === fieldName);
        return ans ? ans.value : null;
    }
}

export default new LinkedInLeadSyncService();
