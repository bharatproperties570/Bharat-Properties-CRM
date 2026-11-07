/**
 * LeadService.js — Enterprise Application Service for Leads
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise CRM Phase 6.2 Application Service.
 * Encapsulates lead updates, deletions, lifecycle stage transitions,
 * phone normalization, lookup resolution, and transaction boundary ownership.
 * Integrates with LeadCreationEngine for standardized lead creation.
 */

import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import Activity from '../models/Activity.js';
import OutboxEvent from '../models/OutboxEvent.js';
import AuditLog from '../models/AuditLog.js';
import LookupService from './LookupService.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';
import { createStandardizedLead } from './LeadCreationEngine.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { getVisibilityFilter } from '../utils/visibility.js';

class LeadService {
    /**
     * Standardized lead creation (delegates to LeadCreationEngine).
     */
    static async createLead(input, options = {}) {
        return await createStandardizedLead(input, options);
    }

    /**
     * Updates an existing lead with transaction boundary, phone normalization,
     * lookup resolution, stage transition detection, and durable OutboxEvent.
     */
    static async updateLead(leadId, updateData = {}, options = {}) {
        const { user = null, session = null } = options;

        if (!leadId || !mongoose.Types.ObjectId.isValid(leadId)) {
            const err = new Error('Invalid or missing lead ID');
            err.statusCode = 400;
            throw err;
        }

        const visibilityFilter = user ? await getVisibilityFilter(user) : {};
        const cleanUpdate = { ...updateData };

        // Normalize phone numbers if modified
        if (cleanUpdate.mobile) {
            cleanUpdate.mobile = normalizePhone(cleanUpdate.mobile);
        }
        if (cleanUpdate.phone) {
            cleanUpdate.phone = normalizePhone(cleanUpdate.phone);
        }

        // Resolve lookups
        if (cleanUpdate.source !== undefined) {
            cleanUpdate.source = await LookupService.resolve('Source', cleanUpdate.source, { session });
        }
        if (cleanUpdate.status !== undefined) {
            cleanUpdate.status = await LookupService.resolve('Status', cleanUpdate.status, { session });
        }
        if (cleanUpdate.stage !== undefined) {
            cleanUpdate.stage = await LookupService.resolve('Stage', cleanUpdate.stage, { session });
        }
        if (cleanUpdate.type !== undefined) {
            cleanUpdate.type = await LookupService.resolve('LeadType', cleanUpdate.type, { session });
        }

        return await withMongoTransaction(async (txnSession) => {
            const existingLead = await Lead.findOne({ _id: leadId, ...visibilityFilter }).session(txnSession);
            if (!existingLead) {
                const err = new Error('Lead not found or access denied');
                err.statusCode = 404;
                throw err;
            }

            const stageChanged = cleanUpdate.stage !== undefined && String(cleanUpdate.stage) !== String(existingLead.stage);
            const previousStage = existingLead.stage;

            Object.assign(existingLead, cleanUpdate);
            existingLead.updatedAt = new Date();
            await existingLead.save({ session: txnSession });

            // Audit log for stage change
            if (stageChanged && user) {
                await AuditLog.logEntityUpdate(
                    'lead_stage_changed',
                    'lead',
                    existingLead._id,
                    existingLead.name || `${existingLead.firstName || ''} ${existingLead.lastName || ''}`.trim() || 'Lead',
                    user._id || user.id,
                    { before: previousStage, after: cleanUpdate.stage },
                    `Lead stage changed from ${previousStage} to ${cleanUpdate.stage}`
                ).catch(() => { });
            }

            // Publish durable OutboxEvent for downstream asynchronous effects
            await OutboxEvent.create([{
                eventType: 'LeadUpdated',
                aggregateType: 'Lead',
                aggregateId: existingLead._id,
                payload: {
                    stageChanged,
                    previousStage,
                    newStage: existingLead.stage,
                    updatedFields: Object.keys(cleanUpdate),
                    actorId: user?._id || user?.id
                },
                tenantId: existingLead.tenantId
            }], { session: txnSession });

            return existingLead;
        }, { session });
    }

    /**
     * Soft deletes a lead and cleans up related tasks within a transaction.
     */
    static async deleteLead(leadId, options = {}) {
        const { user = null, session = null, deleteTasks = true } = options;
        const visibilityFilter = user ? await getVisibilityFilter(user) : {};

        return await withMongoTransaction(async (txnSession) => {
            const lead = await Lead.findOne({ _id: leadId, ...visibilityFilter }).session(txnSession);
            if (!lead) {
                const err = new Error('Lead not found or access denied');
                err.statusCode = 404;
                throw err;
            }

            // Soft delete the lead
            await Lead.softDeleteOne({ _id: leadId, ...visibilityFilter }, { userId: user?._id, session: txnSession });

            // Soft delete associated tasks if requested
            if (deleteTasks) {
                await Activity.softDeleteMany(
                    { entityId: leadId, entityType: 'Lead', ...visibilityFilter },
                    { userId: user?._id, session: txnSession }
                ).catch(() => { });
            }

            if (user) {
                await AuditLog.logEntityUpdate(
                    'lead_deleted',
                    'lead',
                    leadId,
                    lead.name || 'Lead',
                    user._id || user.id,
                    {},
                    `Lead ${lead.name || leadId} soft-deleted`
                ).catch(() => { });
            }

            return { success: true, id: leadId };
        }, { session });
    }

    /**
     * Retrieves a lead by ID with populate.
     */
    static async getLeadById(leadId, options = {}) {
        const { user = null, populate = true } = options;
        const visibilityFilter = user ? await getVisibilityFilter(user) : {};

        let query = Lead.findOne({ _id: leadId, ...visibilityFilter });
        if (populate) {
            query = query
                .populate('owner', 'fullName name email')
                .populate('assignedTo', 'fullName name email')
                .populate('status', 'lookup_value')
                .populate('stage', 'lookup_value')
                .populate('source', 'lookup_value');
        }
        return await query.lean();
    }
}

export default LeadService;
