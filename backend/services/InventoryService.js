/**
 * InventoryService.js — Enterprise Application Service for Inventory
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise CRM Phase 6.2 Application Service.
 * Encapsulates inventory CRUD, owner association, status transitions,
 * address & lookup resolution, and transaction boundary ownership.
 */

import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import AuditLog from '../models/AuditLog.js';
import LookupService from './LookupService.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { getVisibilityFilter } from '../utils/visibility.js';

class InventoryService {
    /**
     * Resolves all inventory lookups and hierarchical address.
     */
    static async resolveInventoryLookups(data = {}, options = {}) {
        const { session = null } = options;
        const resolved = { ...data };

        const lookupFields = [
            { field: 'category', type: 'Category' },
            { field: 'subCategory', type: 'SubCategory' },
            { field: 'unitType', type: 'UnitType' },
            { field: 'status', type: 'Status' },
            { field: 'facing', type: 'Facing' },
            { field: 'direction', type: 'Direction' },
            { field: 'orientation', type: 'Orientation' },
            { field: 'intent', type: 'Intent' },
            { field: 'builtupType', type: 'BuiltupType' },
            { field: 'roadWidth', type: 'RoadWidth' }
        ];

        for (const { field, type } of lookupFields) {
            if (resolved[field] !== undefined) {
                resolved[field] = await LookupService.resolve(type, resolved[field], { session });
            }
        }

        // Default status to Inactive if not specified
        if (!resolved.status) {
            resolved.status = await LookupService.resolve('Status', 'Inactive', { session });
        }

        // Hierarchical address resolution
        if (resolved.address && typeof resolved.address === 'object') {
            resolved.address = await LookupService.resolveHierarchicalAddress(resolved.address, { session });
        }

        return resolved;
    }

    /**
     * Creates a new inventory document with validation, address parsing, and transaction.
     */
    static async createInventory(inputData, options = {}) {
        const { user = null, session = null } = options;
        const resolvedData = await this.resolveInventoryLookups(inputData, { session });

        // Normalize owner phones if present
        if (Array.isArray(resolvedData.owners)) {
            resolvedData.owners = resolvedData.owners.map(owner => {
                if (typeof owner === 'object' && owner !== null && owner.phone) {
                    return { ...owner, phone: normalizePhone(owner.phone) };
                }
                return owner;
            });
        }

        if (user && !resolvedData.createdBy) {
            resolvedData.createdBy = user._id || user.id;
        }

        return await withMongoTransaction(async (txnSession) => {
            const inventory = new Inventory(resolvedData);
            await inventory.save({ session: txnSession });

            if (user) {
                await AuditLog.logEntityUpdate(
                    'inventory_created',
                    'inventory',
                    inventory._id,
                    inventory.unitNo || inventory.name || 'Inventory Unit',
                    user._id || user.id,
                    { unitNo: inventory.unitNo, status: inventory.status },
                    `Inventory unit ${inventory.unitNo || inventory._id} created`
                ).catch(() => { });
            }

            return inventory;
        }, { session });
    }

    /**
     * Updates an existing inventory record within a safe transaction boundary.
     */
    static async updateInventory(inventoryId, updateData, options = {}) {
        const { user = null, session = null } = options;

        if (!inventoryId || !mongoose.Types.ObjectId.isValid(inventoryId)) {
            const err = new Error('Invalid or missing inventory ID');
            err.statusCode = 400;
            throw err;
        }

        const visibilityFilter = user ? await getVisibilityFilter(user) : {};
        const resolvedData = await this.resolveInventoryLookups(updateData, { session });

        return await withMongoTransaction(async (txnSession) => {
            const existing = await Inventory.findOne({ _id: inventoryId, ...visibilityFilter }).session(txnSession);
            if (!existing) {
                const err = new Error('Inventory unit not found or access denied');
                err.statusCode = 404;
                throw err;
            }

            Object.assign(existing, resolvedData);
            existing.updatedAt = new Date();
            await existing.save({ session: txnSession });

            if (user) {
                await AuditLog.logEntityUpdate(
                    'inventory_updated',
                    'inventory',
                    existing._id,
                    existing.unitNo || 'Inventory Unit',
                    user._id || user.id,
                    { updatedFields: Object.keys(resolvedData) },
                    `Inventory unit ${existing.unitNo || existing._id} updated`
                ).catch(() => { });
            }

            return existing;
        }, { session });
    }

    /**
     * Soft deletes an inventory unit.
     */
    static async deleteInventory(inventoryId, options = {}) {
        const { user = null, session = null } = options;
        const visibilityFilter = user ? await getVisibilityFilter(user) : {};

        return await withMongoTransaction(async (txnSession) => {
            const unit = await Inventory.findOne({ _id: inventoryId, ...visibilityFilter }).session(txnSession);
            if (!unit) {
                const err = new Error('Inventory unit not found or access denied');
                err.statusCode = 404;
                throw err;
            }

            await Inventory.softDeleteOne({ _id: inventoryId, ...visibilityFilter }, { userId: user?._id, session: txnSession });
            return { success: true, id: inventoryId };
        }, { session });
    }

    /**
     * Retrieves an inventory unit by ID.
     */
    static async getInventoryById(inventoryId, options = {}) {
        const { user = null, populate = true } = options;
        const visibilityFilter = user ? await getVisibilityFilter(user) : {};

        let query = Inventory.findOne({ _id: inventoryId, ...visibilityFilter });
        if (populate) {
            query = query
                .populate('category', 'lookup_value')
                .populate('subCategory', 'lookup_value')
                .populate('unitType', 'lookup_value')
                .populate('status', 'lookup_value')
                .populate('createdBy', 'fullName name email');
        }
        return await query.lean();
    }
}

export default InventoryService;
