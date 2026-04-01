/**
 * LeadIngestionService
 * Handles creation of leads from parsed portal data with deduplication.
 */

import Lead, { resolveLeadLookup } from '../models/Lead.js';

import AuditLog from '../models/AuditLog.js';
import { runFullLeadEnrichment } from '../src/utils/enrichmentEngine.js';
import { autoAssign } from '../src/services/DistributionService.js';
import mongoose from 'mongoose';

export const ingestLead = async (parsedData) => {
    try {
        if (!parsedData.mobile) {
            console.log('[Lead Ingestion] Skipping lead due to missing mobile number.');
            return null;
        }

        // 1. Deduplication Check
        const existingLead = await Lead.findOne({
            $or: [
                { mobile: parsedData.mobile },
                { email: parsedData.email && parsedData.email.length > 0 ? parsedData.email : '____invalid____' }
            ]
        });

        if (existingLead) {
            console.log(`[Lead Ingestion] Lead already exists: ${existingLead._id}. Updating remarks.`);
            await Lead.findByIdAndUpdate(existingLead._id, {
                $push: { notes: `Interested again via ${parsedData.portal} on ${new Date().toLocaleDateString()}: ${parsedData.listingDetails || ''}` }
            });
            return existingLead;
        }

        // 2. Map source hierarchy based on user instruction:
        // Source = Portal (subsource), SubSource = "Email", Campaign = "Online"
        // Resolve strings to Lookup IDs before creation to avoid Mongoose casting errors
        const source = await resolveLeadLookup("Source", parsedData.portal || "Online");
        const subSource = await resolveLeadLookup("SubSource", "Email");
        const campaign = await resolveLeadLookup("Campaign", "Online");
        const status = await resolveLeadLookup("Status", "New");

        // 3. Create Lead
        const nameParts = (parsedData.name || 'Portal Lead').split(' ');
        const firstName = nameParts[0] || 'Portal';
        const lastName = nameParts.slice(1).join(' ') || 'Lead';

        const lead = await Lead.create({
            firstName,
            lastName,
            mobile: parsedData.mobile,
            email: parsedData.email || null,
            source,
            subSource,
            campaign,
            status,
            description: `Auto-ingested from ${parsedData.portal} Email.`,
            remarks: `Property Advertisement Response\nListing Enquiry: ${parsedData.listingDetails || 'N/A'}`,
            meta: {
                portal: parsedData.portal,
                ingestedAt: new Date()
            }
        });

        console.log(`[Lead Ingestion] Successfully created lead: ${lead._id} from ${parsedData.portal}`);

        // 4. Trigger Enrichment
        try {
            await runFullLeadEnrichment(lead._id);
        } catch (enrichErr) {
            console.error(`[Lead Ingestion] Enrichment failed for ${lead._id}:`, enrichErr.message);
        }

        // 5. Automatic Lead Distribution
        try {
            const assignment = await autoAssign(lead);
            if (assignment && assignment.assignedTo) {
                const assignedTo = assignment.assignedTo;
                await Lead.findByIdAndUpdate(lead._id, { owner: assignedTo });
                console.log(`[Lead Ingestion] Lead ${lead._id} auto-assigned to ${assignedTo} via rule "${assignment.ruleName}"`);
                
                // Log assignment
                const User = mongoose.model('User');
                const agent = await User.findById(assignedTo).lean();
                await AuditLog.logEntityUpdate(
                    'lead_updated', // Using standardized event type
                    'lead',
                    lead._id,
                    `${firstName} ${lastName}`.trim(),
                    null,
                    { owner: assignedTo },
                    `Auto-assigned to ${agent?.fullName || 'Agent'} via distribution rule: ${assignment.ruleName}`
                );
            }
        } catch (distErr) {
            console.error(`[Lead Ingestion] Auto-assignment failed for ${lead._id}:`, distErr.message);
        }

        return lead;
    } catch (error) {
        console.error('[Lead Ingestion Error]:', error);
        throw error;
    }
};

export default { ingestLead };
