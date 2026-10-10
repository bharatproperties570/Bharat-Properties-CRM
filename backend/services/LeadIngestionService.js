/**
 * LeadIngestionService
 * Handles creation of leads from parsed portal data with deduplication.
 */

import Lead, { resolveLeadLookup } from '../models/Lead.js';

import AuditLog from '../models/AuditLog.js';
import { runFullLeadEnrichment } from '../src/utils/enrichmentEngine.js';
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

        const { createStandardizedLead } = await import('./LeadCreationEngine.js');
        const leadResult = await createStandardizedLead({
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
        }, { triggerEvent: 'onEmailCapture' });

        console.log(`[Lead Ingestion] Successfully created lead: ${leadResult.lead._id} from ${parsedData.portal}`);
        return leadResult.lead;
    } catch (error) {
        console.error('[Lead Ingestion Error]:', error);
        throw error;
    }
};

export default { ingestLead };
