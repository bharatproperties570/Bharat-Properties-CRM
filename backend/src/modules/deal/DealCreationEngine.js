import mongoose from 'mongoose';
import crypto from 'crypto';
import Deal from '../../../models/Deal.js';
import Inventory from '../../../models/Inventory.js';
import AutomationLog from '../../../models/AutomationLog.js';
import { acquireLock, releaseLock } from '../../../utils/redisLock.js';
import { syncInventoryStatus } from '../../utils/inventorySync.js';

class DuplicateDealError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DuplicateDealError';
        this.statusCode = 400;
    }
}

class IdempotencyConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'IdempotencyConflictError';
        this.statusCode = 409;
    }
}

class DealCreationEngine {
    static async createDeal(payload, options = {}) {
        const session = await mongoose.startSession();
        let isIdempotentReturn = false;
        let resultDeal = null;

        const idempotencyKey = payload.idempotencyKey;
        const idK = idempotencyKey ? `deal_${idempotencyKey}` : null;
        
        const safePayload = { ...payload };
        delete safePayload.idempotencyKey;
        delete safePayload._id;
        
        const payloadHash = crypto.createHash('sha256').update(JSON.stringify(safePayload, Object.keys(safePayload).sort())).digest('hex');
        
        const hasProjectPre = typeof payload.projectName === 'string' && payload.projectName.trim() !== '';
        const hasUnitPre = typeof payload.unitNo === 'string' && payload.unitNo.trim() !== '';
        const dealId = new mongoose.Types.ObjectId();

                const lockKeys = [];
        
        // 1. Deterministic Idempotency Redis Lock (safe hashed key to bound length and avoid injection)
        if (idK) {
            const safeIdK = crypto.createHash('sha256').update(idK).digest('hex');
            lockKeys.push(`lock:idempotency:${safeIdK}`);
        }

        // 2. Inventory Lock (ObjectId is already safe length and format)
        if (payload.inventoryId) {
            lockKeys.push(`lock:inventory:${payload.inventoryId}`);
        }
        
        // 3. Coordinate Lock (safe hashed key to bound length, avoid injection, and prevent delimiter collisions)
        if (hasProjectPre && hasUnitPre) {
            const coordStr = `${payload.projectName}:|:${payload.block || 'none'}:|:${payload.unitNo}`;
            const safeCoordKey = crypto.createHash('sha256').update(coordStr).digest('hex');
            lockKeys.push(`lock:coord:${safeCoordKey}`);
        }

        // 4. Deterministic sorting to prevent lock-order inversion (deadlocks)
        lockKeys.sort();

        const acquiredLocks = [];

        try {
            for (const key of lockKeys) {
                const lock = await acquireLock(key, { ttl: 45000 });
                acquiredLocks.push(lock);
            }

            const executeOperations = async (txnSession) => {
                const opts = { session: txnSession };

                if (idK) {
                    const existingLog = await AutomationLog.findOne({ idempotencyKey: idK }, null, opts);
                    if (existingLog) {
                        if (existingLog.status === 'success' && existingLog.details?.entityId) {
                            if (existingLog.details.payloadHash !== payloadHash) {
                                throw new IdempotencyConflictError('IDEMPOTENT_CONFLICT: Conflicting payload for the same idempotency key.');
                            }
                            resultDeal = await Deal.findById(existingLog.details.entityId, null, opts);
                            if (resultDeal) {
                                isIdempotentReturn = true;
                                return; // Safe early return inside withTransaction
                            }
                        }
                        throw new IdempotencyConflictError('IDEMPOTENT_CONFLICT: Deal creation in progress or previously failed.');
                    }
                    
                    try {
                        await AutomationLog.create([{ 
                            ruleType: 'LeadCreationRequest',
                            targetEntityId: dealId,
                            targetModule: 'Deal',
                            status: 'pending',
                            idempotencyKey: idK, 
                            details: { payloadHash }
                        }], opts);
                    } catch (err) {
                        if (err.code === 11000) {
                            throw new IdempotencyConflictError('IDEMPOTENT_CONFLICT: Deal creation in progress.');
                        }
                        throw err;
                    }
                }

                if (payload.inventoryId && (!payload.owner || !payload.associatedContact)) {
                    const inventory = await Inventory.findById(payload.inventoryId, null, opts)
                        .populate({ path: 'owners', model: 'Contact' })
                        .populate({ path: 'associates.contact', model: 'Contact' });
                    
                    if (inventory) {
                        if (!payload.owner && inventory.owners?.[0]) {
                            payload.owner = inventory.owners[0]._id;
                            if (!payload.partyStructure) payload.partyStructure = {};
                            payload.partyStructure.owner = inventory.owners[0]._id;
                        }
                        if (!payload.associatedContact && inventory.associates?.[0]?.contact) {
                            payload.associatedContact = inventory.associates[0].contact._id;
                        }
                        
                        if (!payload.projectName) payload.projectName = inventory.projectName;
                        if (!payload.unitNo) payload.unitNo = inventory.unitNo;
                        if (!payload.location) payload.location = inventory.location || inventory.address?.locality;
                        if (!payload.category) payload.category = inventory.category;
                        if (!payload.propertyType) payload.propertyType = inventory.propertyType;
                        if (!payload.unitType) payload.unitType = inventory.unitType;
                    }
                }

                if (payload.inventoryId) {
                    await Inventory.updateOne(
                        { _id: payload.inventoryId },
                        { $set: { _tempTxnLock: new Date() } },
                        opts
                    );
                }

                const orConditions = [];
                if (payload.inventoryId && mongoose.isValidObjectId(payload.inventoryId)) {
                    orConditions.push({ inventoryId: payload.inventoryId, isActiveDeal: true });
                }

                if (hasProjectPre && hasUnitPre) {
                    orConditions.push({
                        projectName: payload.projectName,
                        block: payload.block || null,
                        unitNo: payload.unitNo,
                        isActiveDeal: true
                    });
                }

                if (orConditions.length > 0) {
                    const existingDeal = await Deal.findOne({ $or: orConditions }, null, opts);

                    if (existingDeal) {
                        const msg = (existingDeal.inventoryId && payload.inventoryId && existingDeal.inventoryId.toString() === payload.inventoryId.toString())
                            ? 'DUPLICATE DEAL DETECTED: An active deal already exists for this Inventory Unit.'
                            : 'DUPLICATE DEAL DETECTED: An active deal already exists for this Project/Block/Unit configuration. Duplicate deals are restricted to maintain professional pipeline integrity.';
                        throw new DuplicateDealError(msg);
                    }
                }

                const dealDoc = new Deal(payload);
                dealDoc.$locals = { skipEventBus: true };
                
                // [PARITY] Initialize websiteMetadata deterministically
                if (payload.publishOn?.website) {
                    const slugBase = `${payload.projectName || 'property'}-${payload.unitNo || dealDoc._id.toString().slice(-6)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    dealDoc.isPublished = true;
                    dealDoc.publishedAt = new Date();
                    dealDoc.websiteMetadata = {
                        slug: slugBase,
                        title: payload.projectName || 'New Listing',
                        description: payload.description || payload.remarks || 'Check out this new property listing.'
                    };
                }

                // [PARITY] Initialize stageHistory deterministically
                dealDoc.stageHistory = [{
                    stage: dealDoc.stage || 'Open',
                    enteredAt: new Date(),
                    triggeredBy: 'system',
                    reason: 'Deal created'
                }];
                dealDoc.stageChangedAt = new Date();

                // [SEAM] Execute controlled transactional extension hook
                if (typeof options.transactionalHook === 'function') {
                    await options.transactionalHook({ dealDoc, session: txnSession, context: options.context || {} });
                }

                resultDeal = await dealDoc.save(opts);

                // [PARITY] syncInventoryStatus
                await syncInventoryStatus(resultDeal, opts);

                // [PARITY] AuditLog creation
                if (payload.owner || payload.partyStructure?.buyer) {
                    await mongoose.model('AuditLog').create([{
                        eventType: 'deal_converted',
                        targetType: 'deal',
                        targetId: resultDeal._id,
                        targetName: resultDeal.projectName || 'New Deal',
                        userId: options.auditUser || undefined,
                        changes: { before: null, after: resultDeal.stage || 'Open' },
                        description: `Lead/Contact converted into an active Deal (#${resultDeal.dealId || resultDeal._id}).`,
                        timestamp: new Date()
                    }], opts);
                }

                if (payload.inventoryId) {
                    await Inventory.updateOne(
                        { _id: payload.inventoryId },
                        { $unset: { _tempTxnLock: 1 } },
                        opts
                    );
                }

                if (idK) {
                    await AutomationLog.updateOne(
                        { idempotencyKey: idK },
                        { 
                            $set: { 
                                status: 'success',
                                'details.entityId': resultDeal._id 
                            } 
                        },
                        opts
                    );
                }

                await AutomationLog.create([{
                    ruleType: 'DomainEvent',
                    targetEntityId: resultDeal._id,
                    targetModule: 'Deal',
                    status: 'pending',
                    idempotencyKey: `DomainEvent:DEAL_CREATED:${resultDeal._id}`,
                    executedAt: new Date(),
                    details: { eventType: 'DEAL_CREATED', entityId: resultDeal._id, entityType: 'Deal' }
                }], opts);
            };

            await session.withTransaction(executeOperations, { timeoutMS: 15000 });

        } finally {
            for (let i = acquiredLocks.length - 1; i >= 0; i--) {
                await releaseLock(acquiredLocks[i]).catch(e => {
                    console.error(`[DealCreationEngine] Lock release error for ${acquiredLocks[i].key}:`, e.message);
                });
            }
            await session.endSession();
        }

        return { deal: resultDeal, isIdempotentReturn };
    }
}

export default DealCreationEngine;
