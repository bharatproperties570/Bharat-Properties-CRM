/**
 * ActivityService.js — Enterprise Application Service for Activities
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise CRM Phase 6.2 Application Service.
 * Encapsulates activity creation, timeline tracking, entity association,
 * lastActivityAt propagation, lookup resolution, and durable OutboxEvent dispatch.
 */

import mongoose from 'mongoose';
import Activity from '../models/Activity.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import OutboxEvent from '../models/OutboxEvent.js';
import LookupService from './LookupService.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { getVisibilityFilter } from '../utils/visibility.js';

class ActivityService {
    /**
     * Creates an activity within a transaction, updates entity lastActivityAt,
     * and publishes durable Outbox events for Google sync and lead enrichment.
     */
    static async createActivity(activityData, options = {}) {
        const { user = null, session = null, syncGoogle = false, triggerEnrichment = true } = options;
        const cleanData = { ...activityData };

        if (user && !cleanData.performedBy) {
            cleanData.performedBy = user.fullName || user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim();
        }
        if (user && !cleanData.assignedTo) {
            cleanData.assignedTo = user._id || user.id;
        }

        if (cleanData.phoneNumber) {
            cleanData.phoneNumber = normalizePhone(cleanData.phoneNumber);
        }

        return await withMongoTransaction(async (txnSession) => {
            const activity = new Activity(cleanData);
            await activity.save({ session: txnSession });

            // Update entity's lastActivityAt if completed/performed
            if (activity.entityId) {
                const now = new Date();
                if (activity.entityType?.toLowerCase() === 'lead') {
                    await Lead.findByIdAndUpdate(activity.entityId, { lastActivityAt: now }, { session: txnSession }).catch(() => { });
                } else if (activity.entityType?.toLowerCase() === 'deal') {
                    await Deal.findByIdAndUpdate(activity.entityId, { lastActivityAt: now }, { session: txnSession }).catch(() => { });
                }
            }

            // Publish durable ActivityCreated event
            await OutboxEvent.create([{
                eventType: 'ActivityCreated',
                aggregateType: 'Activity',
                aggregateId: activity._id,
                payload: {
                    type: activity.type,
                    subject: activity.subject,
                    entityId: activity.entityId,
                    entityType: activity.entityType,
                    status: activity.status,
                    actorId: user?._id || user?.id,
                    syncToGoogle: syncGoogle
                },
                tenantId: activity.tenantId
            }], { session: txnSession });

            // If background lead enrichment requested, publish durable outbox event
            if (triggerEnrichment && activity.entityType?.toLowerCase() === 'lead' && activity.entityId) {
                await OutboxEvent.create([{
                    eventType: 'LeadEnrichmentRequested',
                    aggregateType: 'Lead',
                    aggregateId: activity.entityId,
                    payload: { leadId: activity.entityId },
                    tenantId: activity.tenantId
                }], { session: txnSession }).catch(() => { });
            }

            return activity;
        }, { session });
    }

    /**
     * Updates an activity within a transaction and publishes ActivityUpdated Outbox event.
     */
    static async updateActivity(activityId, updateData, options = {}) {
        const { user = null, session = null } = options;

        if (!activityId || !mongoose.Types.ObjectId.isValid(activityId)) {
            const err = new Error('Invalid activity ID');
            err.statusCode = 400;
            throw err;
        }

        const visibilityFilter = user ? await getVisibilityFilter(user) : {};
        const cleanUpdate = { ...updateData };

        if (cleanUpdate.status === 'Completed' && user && !cleanUpdate.performedBy) {
            cleanUpdate.performedBy = user.fullName || user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim();
        }

        return await withMongoTransaction(async (txnSession) => {
            const existing = await Activity.findOne({ _id: activityId, ...visibilityFilter }).session(txnSession);
            if (!existing) {
                const err = new Error('Activity not found');
                err.statusCode = 404;
                throw err;
            }

            Object.assign(existing, cleanUpdate);
            existing.updatedAt = new Date();
            await existing.save({ session: txnSession });

            // Publish durable ActivityUpdated Outbox event
            await OutboxEvent.create([{
                eventType: 'ActivityUpdated',
                aggregateType: 'Activity',
                aggregateId: existing._id,
                payload: {
                    updatedFields: Object.keys(cleanUpdate),
                    status: existing.status,
                    entityId: existing.entityId,
                    entityType: existing.entityType,
                    actorId: user?._id || user?.id
                },
                tenantId: existing.tenantId
            }], { session: txnSession });

            return existing;
        }, { session });
    }

    /**
     * Soft deletes an activity and enqueues Google delete event via Outbox.
     */
    static async deleteActivity(activityId, options = {}) {
        const { user = null, session = null } = options;
        const visibilityFilter = user ? await getVisibilityFilter(user) : {};

        return await withMongoTransaction(async (txnSession) => {
            const activity = await Activity.findOne({ _id: activityId, ...visibilityFilter }).session(txnSession);
            if (!activity) {
                const err = new Error('Activity not found');
                err.statusCode = 404;
                throw err;
            }

            await Activity.softDeleteOne({ _id: activityId, ...visibilityFilter }, { userId: user?._id, session: txnSession });

            // If synced with Google Calendar, dispatch durable Google sync delete
            if (activity.googleEventId) {
                await OutboxEvent.create([{
                    eventType: 'GoogleSyncRequested',
                    aggregateType: 'Activity',
                    aggregateId: activity._id,
                    payload: { action: 'deleteEvent', googleEventId: activity.googleEventId },
                    tenantId: activity.tenantId
                }], { session: txnSession }).catch(() => { });
            }

            // Publish ActivityDeleted Outbox event
            await OutboxEvent.create([{
                eventType: 'ActivityDeleted',
                aggregateType: 'Activity',
                aggregateId: activity._id,
                payload: {
                    actorId: user?._id || user?.id
                },
                tenantId: activity.tenantId
            }], { session: txnSession });

            return { success: true, id: activityId };
        }, { session });
    }
}

export default ActivityService;
