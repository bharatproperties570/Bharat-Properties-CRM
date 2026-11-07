/**
 * DealService.js — Enterprise Application Service for Deals
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise CRM Phase 6.2 Application Service.
 * Encapsulates all non-creation deal business orchestration, stage transitions,
 * lookup resolution, validation, and transaction boundary ownership.
 * Integrates with DealCreationEngine for standardized deal creation.
 */

import mongoose from 'mongoose';
import Deal from '../models/Deal.js';
import OutboxEvent from '../models/OutboxEvent.js';
import AuditLog from '../models/AuditLog.js';
import LookupService from './LookupService.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';
import { createStandardizedDeal } from './DealCreationEngine.js';
import { getVisibilityFilter } from '../utils/visibility.js';

class DealService {
    /**
     * Standardized deal creation (delegates to DealCreationEngine).
     */
    static async createDeal(input, options = {}) {
        return await createStandardizedDeal(input, options);
    }

    /**
     * Updates an existing deal with transaction boundary, lookup resolution,
     * stage change auditing, and durable Outbox event publication.
     *
     * @param {string} dealId - Deal ObjectId string
     * @param {object} updateData - Update payload
     * @param {object} options - Options containing user, session, etc.
     * @returns {Promise<object>} - Updated Deal document
     */
    static async updateDeal(dealId, updateData = {}, options = {}) {
        const { user = null, session = null } = options;

        if (!dealId || !mongoose.Types.ObjectId.isValid(dealId)) {
            const err = new Error('Invalid or missing deal ID');
            err.statusCode = 400;
            throw err;
        }

        const visibilityFilter = user ? await getVisibilityFilter(user) : {};
        const cleanUpdate = { ...updateData };

        // Resolve common Lookups via LookupService
        if (cleanUpdate.category !== undefined) {
            cleanUpdate.category = await LookupService.resolve('Category', cleanUpdate.category, { session });
        }
        if (cleanUpdate.subCategory !== undefined) {
            cleanUpdate.subCategory = await LookupService.resolve('SubCategory', cleanUpdate.subCategory, { session });
        }
        if (cleanUpdate.unitType !== undefined) {
            cleanUpdate.unitType = await LookupService.resolve('UnitType', cleanUpdate.unitType, { session });
        }
        if (cleanUpdate.facing !== undefined) {
            cleanUpdate.facing = await LookupService.resolve('Facing', cleanUpdate.facing, { session });
        }
        if (cleanUpdate.intent !== undefined) {
            cleanUpdate.intent = await LookupService.resolve('Intent', cleanUpdate.intent, { session });
        }
        if (cleanUpdate.status !== undefined) {
            cleanUpdate.status = await LookupService.resolve('Status', cleanUpdate.status, { session });
        }

        return await withMongoTransaction(async (txnSession) => {
            const existingDeal = await Deal.findOne({ _id: dealId, ...visibilityFilter }).session(txnSession);
            if (!existingDeal) {
                const err = new Error('Deal not found or access denied');
                err.statusCode = 404;
                throw err;
            }

            const stageChanged = cleanUpdate.stage !== undefined && cleanUpdate.stage !== existingDeal.stage;
            const previousStage = existingDeal.stage;

            // Apply updates
            Object.assign(existingDeal, cleanUpdate);
            existingDeal.updatedAt = new Date();
            await existingDeal.save({ session: txnSession });

            // Audit log for stage change
            if (stageChanged && user) {
                await AuditLog.logEntityUpdate(
                    'deal_stage_changed',
                    'deal',
                    existingDeal._id,
                    existingDeal.title || 'Deal',
                    user._id || user.id,
                    { before: previousStage, after: cleanUpdate.stage },
                    `Deal stage changed from ${previousStage} to ${cleanUpdate.stage}`
                ).catch(() => { });
            }

            // Publish durable OutboxEvent for downstream asynchronous effects
            await OutboxEvent.create([{
                eventType: 'DealUpdated',
                aggregateType: 'Deal',
                aggregateId: existingDeal._id,
                payload: {
                    stageChanged,
                    previousStage,
                    newStage: existingDeal.stage,
                    updatedFields: Object.keys(cleanUpdate),
                    actorId: user?._id || user?.id
                },
                tenantId: existingDeal.tenantId
            }], { session: txnSession });

            return existingDeal;
        }, { session });
    }

    /**
     * Changes a deal's stage with validation and atomic transaction.
     */
    static async changeStage(dealId, newStage, options = {}) {
        return await this.updateDeal(dealId, { stage: newStage }, options);
    }

    /**
     * Soft deletes a deal within a safe transaction boundary.
     */
    static async deleteDeal(dealId, options = {}) {
        const { user = null, session = null } = options;
        const visibilityFilter = user ? await getVisibilityFilter(user) : {};

        return await withMongoTransaction(async (txnSession) => {
            const deal = await Deal.findOne({ _id: dealId, ...visibilityFilter }).session(txnSession);
            if (!deal) {
                const err = new Error('Deal not found or access denied');
                err.statusCode = 404;
                throw err;
            }

            if (typeof deal.softDelete === 'function') {
                await deal.softDelete(user?._id, { session: txnSession, reason: options.reason || 'Deal deleted' });
            } else {
                await Deal.softDeleteOne(
                    { _id: dealId, ...visibilityFilter },
                    { userId: user?._id, session: txnSession, reason: options.reason || 'Deal deleted' }
                );
            }

            // Reset inventory status if the deal was deleted and no other active deals remain
            if (deal.inventoryId) {
                const activeDeals = await Deal.countDocuments({
                    _id: { $ne: deal._id },
                    inventoryId: deal.inventoryId,
                    stage: { $nin: ['Cancelled', 'Closed Lost', 'Closed', 'Closed Won', 'Sold Out'] }
                }).session(txnSession);
                if (activeDeals === 0) {
                    const Lookup = mongoose.model('Lookup');
                    let availableLookup = null;
                    try {
                        availableLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Available' }).session(txnSession).lean();
                    } catch {
                        availableLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Available' }).lean();
                    }
                    const availableId = availableLookup ? availableLookup._id : 'Available';
                    const Inventory = mongoose.model('Inventory');
                    await Inventory.findByIdAndUpdate(deal.inventoryId, { status: availableId }, { session: txnSession });
                }
            }
            return { success: true, id: dealId };
        }, { session });
    }

    /**
     * Retrieves a single deal by ID with visibility filtering and population.
     */
    static async getDealById(dealId, options = {}) {
        const { user = null, populate = true } = options;
        const visibilityFilter = user ? await getVisibilityFilter(user) : {};

        let query = Deal.findOne({ _id: dealId, ...visibilityFilter });
        if (populate) {
            query = query
                .populate('leadId', 'name mobile email status stage')
                .populate('owner', 'fullName name email')
                .populate('category', 'lookup_value')
                .populate('subCategory', 'lookup_value')
                .populate('unitType', 'lookup_value');
        }
        return await query.lean();
    }
}

export default DealService;
