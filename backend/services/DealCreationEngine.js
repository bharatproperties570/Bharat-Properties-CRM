import mongoose from 'mongoose';
import AutomationLog from '../models/AutomationLog.js';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import AuditLog from '../models/AuditLog.js';
import SystemSetting from '../models/SystemSetting.js';
import OutboxEvent from '../models/OutboxEvent.js';
import { v4 as uuidv4 } from 'uuid';

export const syncInventoryStatus = async (deal, opts = {}, forceTransition = false) => {
    if (!deal.inventoryId) return;

    const InventoryModel = mongoose.model('Inventory');
    const LookupModel = mongoose.model('Lookup');
    const DealModel = mongoose.model('Deal');

    const availableLookup = await LookupModel.findOne({ lookup_type: 'Status', lookup_value: 'Available' }).lean();
    const activeLookup = await LookupModel.findOne({ lookup_type: 'Status', lookup_value: 'Active' }).lean();

    const availableId = availableLookup ? availableLookup._id : 'Available';
    const activeId = activeLookup ? activeLookup._id : 'Active';

    if (deal.stage === 'Closed' || deal.stage === 'Closed Won') {
        await InventoryModel.findByIdAndUpdate(deal.inventoryId, { status: 'Sold Out' }, opts);
        return;
    }

    if (deal.stage === 'Booked') {
        const filter = {
            _id: deal.inventoryId,
            $or: [
                { status: availableId },
                { status: activeId },
                { status: null },
                { status: { $exists: false } }
            ]
        };
        const result = await InventoryModel.findOneAndUpdate(filter, { status: 'Blocked' }, opts);
        if (!result) {
            const err = new Error(`INVENTORY_UNAVAILABLE: Unit ${deal.inventoryId} cannot transition to Booked/Blocked. It may be reserved or in an invalid state.`);
            err.code = 'INVENTORY_UNAVAILABLE';
            throw err;
        }
        return;
    }

    if (['Cancelled', 'Closed Lost'].includes(deal.stage)) {
        const activeDeals = await DealModel.countDocuments({
            inventoryId: deal.inventoryId,
            stage: { $nin: ['Cancelled', 'Closed Lost', 'Closed', 'Closed Won', 'Sold Out'] }
        }).session(opts.session || null);

        if (activeDeals === 0) {
            await InventoryModel.findByIdAndUpdate(deal.inventoryId, { status: 'Available' }, opts);
        }
        return;
    }
};

export const createStandardizedDeal = async (input, options = {}) => {
    const {
        source,
        idempotencyKey,
        correlationId,
        dealData,
        linkage,
        ownerInfo
    } = input;

    const {
        triggerSms = false,
        triggerDistribution = false,
        triggerAiMatch = false,
        triggerMarketing = false,
        triggerDocumentSync = false,
        triggerDiscovery = false,
        publishOnWebsite = false,
        session: parentSession = null
    } = options;

    if (!source) throw new Error('Source is required');
    if (!dealData) throw new Error('dealData is required');

    let deal = null;
    let isIdempotentReplay = false;
    let warnings = [];
    const postCommitTasks = [];

    const isExternalSession = !!parentSession;
    const session = parentSession || await mongoose.startSession();

    try {
        if (!isExternalSession) {
            session.startTransaction();
        }

        // 1. Idempotency Lock
        let activeIdK = null;
        if (idempotencyKey) {
            activeIdK = `${source}_${idempotencyKey}`;
            const existingLog = await AutomationLog.findOne({ idempotencyKey: activeIdK }).session(session);
            if (existingLog) {
                if (existingLog.status === 'success' && existingLog.targetEntityId) {
                    deal = await Deal.findById(existingLog.targetEntityId).session(session);
                    isIdempotentReplay = true;
                } else {
                    const conflictErr = new Error('IDEMPOTENT_CONFLICT: A request with this idempotency key is already processing or failed.');
                    conflictErr.code = 'IDEMPOTENT_CONFLICT';
                    throw conflictErr;
                }
            } else {
                try {
                    await AutomationLog.create([{
                        idempotencyKey: activeIdK,
                        status: 'pending',
                        ruleType: 'IdempotencyLock',
                        createdAt: new Date()
                    }], { session });
                } catch (err) {
                    if (err.code === 11000) {
                        const conflictErr = new Error('IDEMPOTENT_CONFLICT: A request with this idempotency key is already processing.');
                        conflictErr.code = 'IDEMPOTENT_CONFLICT';
                        throw conflictErr;
                    }
                    throw err;
                }
            }
        }

        if (!isIdempotentReplay) {
            // 2. Load Inventory inside session (and apply _tempTxnLock)
            let inventory = null;
            if (linkage?.inventoryId) {
                await Inventory.updateOne(
                    { _id: linkage.inventoryId },
                    { $set: { _tempTxnLock: new Date() } },
                    { session }
                );

                inventory = await Inventory.findById(linkage.inventoryId).session(session);
                if (!inventory) {
                    const err = new Error(`Inventory unavailable: ${linkage.inventoryId}`);
                    err.code = 'INVENTORY_UNAVAILABLE';
                    throw err;
                }
            }

            // 3. Coordinate Duplicate Check
            const dupPolicy = await SystemSetting.findOne({ key: 'crm_duplicate_policy' }).session(session).lean();
            const isStrict = dupPolicy ? (dupPolicy.value === 'strict') : true;

            if (isStrict && inventory) {
                const coordQuery = {
                    $or: [
                        { inventoryId: linkage.inventoryId }
                    ],
                    stage: { $nin: ['Cancelled', 'Closed Lost', 'Closed', 'Closed Won', 'Sold Out'] }
                };

                if (dealData.projectName && dealData.unitNo) {
                    coordQuery.$or.push({
                        projectName: dealData.projectName,
                        block: dealData.block,
                        unitNo: dealData.unitNo
                    });
                }

                const duplicateDeal = await Deal.findOne(coordQuery).session(session);
                if (duplicateDeal) {
                    const dupErr = new Error(`DUPLICATE DEAL DETECTED: An active deal already exists for this unit.`);
                    dupErr.code = 'DUPLICATE_DEAL';
                    dupErr.duplicateId = duplicateDeal._id;
                    throw dupErr;
                }
            }

            // 4. Normalize and Inject Geo (Bypass unsafe hook)
            const normalizedDealPayload = {
                ...dealData,
                source,
                inventoryId: linkage?.inventoryId,
                projectId: linkage?.projectId,
                leadId: linkage?.leadId,
                bookingId: linkage?.bookingId,
                owner: ownerInfo?.owner,
                partyStructure: {
                    buyer: ownerInfo?.buyer,
                    channelPartner: ownerInfo?.channelPartner
                }
            };

            if (inventory) {
                normalizedDealPayload.latitude = inventory.latitude || inventory.lat || null;
                normalizedDealPayload.longitude = inventory.longitude || inventory.lng || null;
                if (inventory.geoPoint) {
                    normalizedDealPayload.geoPoint = inventory.geoPoint;
                }
            }

            // 5. Create Deal
            const createdDeals = await Deal.create([normalizedDealPayload], { session });
            deal = createdDeals[0];

            // 6. Release _tempTxnLock & Sync Status
            if (linkage?.inventoryId) {
                await Inventory.updateOne(
                    { _id: linkage.inventoryId },
                    { $unset: { _tempTxnLock: 1 } },
                    { session }
                );
            }

            if (activeIdK) {
                await AutomationLog.updateOne(
                    { idempotencyKey: activeIdK },
                    { $set: { targetEntityId: deal._id, status: 'success' } },
                    { session }
                );
            }

            // 7. Stage History
            await Deal.findByIdAndUpdate(deal._id, {
                $push: {
                    stageHistory: {
                        stage: deal.stage || 'Open',
                        enteredAt: new Date(),
                        triggeredBy: 'system',
                        reason: `Deal created via ${source}`
                    }
                },
                $set: { stageChangedAt: new Date() }
            }, { session });

            // 8. Inventory Sync
            await syncInventoryStatus(deal, { session });

            if (publishOnWebsite) {
                const slugBase = `${deal.projectName || 'property'}-${deal.unitNo || deal._id.toString().slice(-6)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                await Deal.findByIdAndUpdate(deal._id, {
                    isPublished: true,
                    publishedAt: new Date(),
                    'websiteMetadata.slug': slugBase,
                    'websiteMetadata.title': deal.projectName || 'New Listing',
                    'websiteMetadata.description': deal.description || deal.remarks || 'Check out this new property listing.'
                }, { session });
            }

            // 9. Audit Log
            if (linkage?.leadId || ownerInfo?.owner || ownerInfo?.buyer) {
                await AuditLog.create([{
                    eventType: 'deal_converted',
                    targetType: 'deal',
                    targetId: deal._id,
                    targetName: deal.projectName || 'New Deal',
                    changes: { before: null, after: deal.stage || 'Open' },
                    description: `Lead/Contact converted into an active Deal (#${deal.dealId || deal._id}).`,
                    timestamp: new Date()
                }], { session });
            }

            // R56 STAGE 2: Durable Outbox Integration
            await OutboxEvent.create([{
                eventId: uuidv4(),
                eventType: 'DealCreated',
                aggregateType: 'Deal',
                aggregateId: deal._id,
                payload: {
                    triggerDistribution: triggerDistribution,
                    triggerMarketing: triggerMarketing,
                    triggerSms: triggerSms,
                    triggerAiMatch: triggerAiMatch,
                    triggerDiscovery: triggerDiscovery,
                    inventoryId: linkage?.inventoryId || null,
                    documents: (triggerDocumentSync && dealData.documents?.length) ? dealData.documents : []
                }
            }], { session });
        }

        if (!isExternalSession) {
            await session.commitTransaction();
        }
    } catch (err) {
        if (!isExternalSession && session.inTransaction()) {
            await session.abortTransaction();
        }
        if (err.code !== 'IDEMPOTENT_CONFLICT' && err.code !== 'DUPLICATE_DEAL' && err.code !== 'INVENTORY_UNAVAILABLE') {
            err.code = 'TRANSACTION_FAILED';
        }
        throw err;
    } finally {
        if (!isExternalSession) {
            session.endSession();
        }
    }

    // R56 STAGE 2: Post-commit tasks are now durably queued in OutboxEvent.
    // We return an empty postCommitTasks array to preserve controller contract.
    return {
        success: true,
        deal,
        isIdempotentReplay,
        warnings,
        postCommitTasks: []
    };
};
