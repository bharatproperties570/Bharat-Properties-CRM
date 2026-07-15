import mongoose from 'mongoose';
import { buildWhatsAppTemplate, buildEmailTemplate, buildSmsTemplate, buildMultiEmailTemplate, buildMultiSmsTemplate } from '../services/CampaignConfig.js';
import waService from '../services/WhatsAppService.js';
import smsSvc from '../services/SmsService.js';
import eSvc from '../services/email.service.js';
import VariableResolutionService from '../services/VariableResolutionService.js';
import DispatchJob from '../models/DispatchJob.js';

// Define the logic that actually runs the dispatch
export const executeDispatch = async (payload, user) => {
    const { dealIds, leadIds, toggles, hidePrice, matchContext } = payload;
    
    const finalDealIds = Array.isArray(dealIds) ? dealIds : [];
    const finalLeadIds = Array.isArray(leadIds) ? leadIds : [];

    const Inventory = mongoose.model('Inventory');
    const Deal = mongoose.model('Deal');
    const Lead = mongoose.model('Lead');
    const Activity = mongoose.model('Activity');
    const SystemSetting = mongoose.model('SystemSetting');

    const visibilityFilter = user ? { /* whatever your getVisibilityFilter returns */ } : {};

    // 1. Fetch all deals FIRST
    const populatedDeals = [];
    for (const dId of finalDealIds) {
        let propertyData = await Inventory.findOne({ _id: dId, ...visibilityFilter }).lean();
        if (!propertyData) {
            propertyData = await Deal.findOne({ _id: dId, ...visibilityFilter }).lean();
        }
        if (propertyData) populatedDeals.push(propertyData);
    }

    if (populatedDeals.length === 0) return { success: false, message: 'No properties found.' };

    const overallResults = [];

    // 2. Iterate over Leads (Send ONE consolidated message per lead)
    for (const lId of finalLeadIds) {
        const lead = await Lead.findOne({ _id: lId, ...visibilityFilter }).lean();
        if (!lead) continue;

        console.log(`[ManualDispatch] Processing Match for Lead:${lId} with ${populatedDeals.length} properties.`);
        const matchResults = [];

        // WhatsApp
        if (toggles?.whatsapp && (lead.mobile || lead.phones?.[0])) {
            const mobile = lead.mobile || lead.phones?.[0]?.number || lead.phones?.[0];
            
            // Enrich lead with properties for VariableResolutionService
            const enrichedLead = { 
                ...lead, 
                matchedProperties: populatedDeals.map(p => ({ inventoryId: p })) 
            };

            const registrySetting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
            const mapping = (registrySetting && registrySetting.value) ? registrySetting.value : {
                "1": "name",
                "2": "location",
                "3": "matchList"
            };

            const resolvedParams = VariableResolutionService.resolveForLeads(enrichedLead, mapping);
            
            let message = `Hi ${resolvedParams["1"] || 'Customer'} 👋\n\nBased on your requirement in ${resolvedParams["2"] || 'your preferred area'}, here are a few suitable options:\n\n${resolvedParams["3"] || resolvedParams["4"] || resolvedParams["5"] || 'Property matches below:'}`;
            
            Object.keys(mapping).forEach(key => {
                if (mapping[key] === 'matchList') {
                    message = `Hi ${resolvedParams["1"] || 'Customer'} 👋\n\nBased on your requirement in ${resolvedParams["2"] || 'your preferred area'}, here are a few suitable options:\n\n${resolvedParams[key]}`;
                }
            });

            try {
                const res = await waService.sendMessage(mobile, message);
                matchResults.push({ channel: 'whatsapp', status: res.success ? 'success' : 'failed' });
            } catch (err) { matchResults.push({ channel: 'whatsapp', status: 'failed', error: err.message }); }
        }

        // Email
        const emailAddr = lead.email || (Array.isArray(lead.emails) ? (lead.emails[0]?.address || lead.emails[0]) : null);
        if (toggles?.email && emailAddr) {
            const template = buildMultiEmailTemplate(populatedDeals, hidePrice, matchContext);
            try {
                await eSvc.sendEmail(emailAddr, template.subject, template.text, template.html);
                matchResults.push({ channel: 'email', status: 'success' });
            } catch (err) { matchResults.push({ channel: 'email', status: 'failed', error: err.message }); }
        }

        // SMS
        if (toggles?.sms && (lead.mobile || lead.phones?.[0])) {
            const mobile = lead.mobile || lead.phones?.[0]?.number || lead.phones?.[0];
            const template = buildMultiSmsTemplate(populatedDeals, hidePrice, matchContext);
            try {
                const res = await smsSvc.sendSms(mobile, template.message);
                matchResults.push({ channel: 'sms', status: res.success ? 'success' : 'failed' });
            } catch (err) { matchResults.push({ channel: 'sms', status: 'failed', error: err.message }); }
        }

        // Log Activity
        try {
            await Activity.create({
                type: 'Marketing',
                subject: `Sent ${matchContext === 'perfect' ? 'Perfect Matches' : 'Top Matches'} (${populatedDeals.length} properties)`,
                entityType: 'Lead',
                entityId: lead._id,
                dueDate: new Date(),
                performedAt: new Date(),
                status: 'Completed',
                description: `Dispatched details to ${lead.fullName || lead.firstName} via ${matchResults.filter(r => r.status === 'success').map(r => r.channel).join(', ') || 'none'}`,
                details: { results: matchResults, toggles, matchedCount: populatedDeals.length, hidePrice },
                performedBy: user?.firstName || 'System',
                assignedTo: user?._id
            });
        } catch (logErr) { console.error('[ManualDispatch] Activity Log Error:', logErr.message); }

        overallResults.push({ leadId: lId, results: matchResults });
    }
    
    return { success: true, results: overallResults };
};

export const sendManualMatch = async (req, res) => {
    console.log('[ManualDispatch] Incoming Request:', { body: req.body, user: req.user?._id });
    try {
        let { dealId, leadId, dealIds, leadIds, toggles, hidePrice, matchContext, scheduledAt } = req.body;
        
        // Normalize to arrays
        const finalDealIds = Array.isArray(dealIds) ? dealIds : (dealId ? [dealId] : []);
        const finalLeadIds = Array.isArray(leadIds) ? leadIds : (leadId ? [leadId] : []);

        if (finalDealIds.length === 0 || finalLeadIds.length === 0) {
            console.error('[ManualDispatch] Bad Request: Missing IDs');
            return res.status(400).json({ success: false, error: 'Deal IDs and Lead IDs are required' });
        }

        if (scheduledAt) {
            const delay = new Date(scheduledAt).getTime() - Date.now();
            if (delay > 0) {
                console.log(`[ManualDispatch] Writing to DispatchJob for ${scheduledAt}`);
                await DispatchJob.create({
                    leadIds: finalLeadIds,
                    dealIds: finalDealIds,
                    toggles: toggles || {},
                    hidePrice: hidePrice || false,
                    matchContext: matchContext || 'perfect',
                    scheduledAt: new Date(scheduledAt),
                    status: 'pending'
                });
                return res.json({ success: true, message: `Dispatched correctly. Scheduled for ${new Date(scheduledAt).toLocaleString()}` });
            }
        }
        
        // Execute immediately
        const payload = { dealIds: finalDealIds, leadIds: finalLeadIds, toggles, hidePrice, matchContext };
        const result = await executeDispatch(payload, req.user);
        
        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('[ManualDispatch] FATAL ERROR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
