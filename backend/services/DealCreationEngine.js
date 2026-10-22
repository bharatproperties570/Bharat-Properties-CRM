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
    let session = parentSession;
    if (!session && mongoose.connection && mongoose.connection.readyState === 1 && typeof mongoose.startSession === 'function') {
        try {
            session = await mongoose.startSession();
        } catch (sErr) {
            session = null;
        }
    }

    try {
        if (!isExternalSession && session && typeof session.startTransaction === 'function') {
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
            let dupPolicy = null;
            if (mongoose.connection?.readyState === 1) {
                dupPolicy = await SystemSetting.findOne({ key: 'crm_duplicate_policy' }).session(session).lean();
            }
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

            // 🏛️ Enterprise RBAC: Project/Inventory -> Deal Inheritance
            if (inventory) {
                if (!normalizedDealPayload.team && (!normalizedDealPayload.teams || normalizedDealPayload.teams.length === 0)) {
                    normalizedDealPayload.team = inventory.team;
                    normalizedDealPayload.teams = Array.isArray(inventory.teams) && inventory.teams.length ? inventory.teams : (inventory.team ? [inventory.team] : []);
                }
                if (!normalizedDealPayload.assignedTo && !normalizedDealPayload.assignment?.assignedTo) {
                    normalizedDealPayload.assignedTo = inventory.assignedTo || (inventory.assignment && inventory.assignment.assignedTo);
                }
                if (!normalizedDealPayload.visibleTo && (!normalizedDealPayload.assignment || !normalizedDealPayload.assignment.visibleTo)) {
                    normalizedDealPayload.visibleTo = inventory.visibleTo || (inventory.assignment && inventory.assignment.visibleTo) || "Team";
                }
            } else if (linkage?.projectId && mongoose.connection?.readyState === 1) {
                const ProjectModel = mongoose.model("Project");
                const projectDoc = await ProjectModel.findById(linkage.projectId).session(session).lean();
                if (projectDoc) {
                    if (!normalizedDealPayload.team && (!normalizedDealPayload.teams || normalizedDealPayload.teams.length === 0)) {
                        normalizedDealPayload.team = projectDoc.team?.[0] || projectDoc.teams?.[0];
                        normalizedDealPayload.teams = projectDoc.teams?.length ? projectDoc.teams : (projectDoc.team || []);
                    }
                    if (!normalizedDealPayload.assignedTo && !normalizedDealPayload.assignment?.assignedTo) {
                        normalizedDealPayload.assignedTo = projectDoc.assign?.[0] || projectDoc.owner;
                    }
                    if (!normalizedDealPayload.visibleTo && (!normalizedDealPayload.assignment || !normalizedDealPayload.assignment.visibleTo)) {
                        normalizedDealPayload.visibleTo = projectDoc.visibleTo || "Team";
                    }
                }
            }

            // Synchronize team and teams
            if (normalizedDealPayload.team && (!normalizedDealPayload.teams || normalizedDealPayload.teams.length === 0)) {
                normalizedDealPayload.teams = Array.isArray(normalizedDealPayload.team) ? normalizedDealPayload.team : [normalizedDealPayload.team];
            } else if (normalizedDealPayload.teams && (!normalizedDealPayload.team || normalizedDealPayload.team.length === 0)) {
                normalizedDealPayload.team = Array.isArray(normalizedDealPayload.teams) ? normalizedDealPayload.teams[0] : normalizedDealPayload.teams;
            }

            // Normalize visibleTo (Private, Team, Everyone) and sync assignment.visibleTo
            let finalDealVisibleTo = normalizedDealPayload.visibleTo || normalizedDealPayload.assignment?.visibleTo || "Team";
            if (finalDealVisibleTo === "Public" || finalDealVisibleTo === "All Users") {
                finalDealVisibleTo = "Everyone";
            }
            normalizedDealPayload.visibleTo = finalDealVisibleTo;
            if (!normalizedDealPayload.assignment) normalizedDealPayload.assignment = {};
            normalizedDealPayload.assignment.visibleTo = finalDealVisibleTo;
            if (normalizedDealPayload.team && (!normalizedDealPayload.assignment.team || !normalizedDealPayload.assignment.team.length)) {
                normalizedDealPayload.assignment.team = Array.isArray(normalizedDealPayload.team) ? normalizedDealPayload.team : [normalizedDealPayload.team];
            }

            // 4b. Closed-Loop Lead & Site Visit Attribution Inheritance
            const LeadModel = mongoose.models.Lead || (mongoose.default ? mongoose.default.model('Lead') : mongoose.model('Lead'));
            const ActivityModel = mongoose.models.Activity || (mongoose.default ? mongoose.default.model('Activity') : mongoose.model('Activity'));

            let leadDoc = null;
            if (linkage?.leadId) {
                try {
                    leadDoc = await LeadModel.findById(linkage.leadId).session(session).lean();
                } catch (e) {
                    leadDoc = await LeadModel.findById(linkage.leadId).lean().catch(() => null);
                }
            }

            if (leadDoc) {
                if (!normalizedDealPayload.marketingAttribution) {
                    const meta = leadDoc.source_meta || {};
                    normalizedDealPayload.marketingAttribution = {
                        source: meta.utm_source || meta.source || (typeof leadDoc.source === 'string' ? leadDoc.source : 'Direct'),
                        medium: meta.utm_medium || meta.medium || 'organic',
                        campaign: meta.utm_campaign || meta.campaign || (typeof leadDoc.campaign === 'string' ? leadDoc.campaign : ''),
                        content: meta.utm_content || meta.content || '',
                        term: meta.utm_term || meta.term || '',
                        landingPage: meta.landingPage || '',
                        referrer: meta.referrer || '',
                        capturedAt: leadDoc.createdAt || new Date()
                    };
                }
                if (!normalizedDealPayload.source || normalizedDealPayload.source === 'API' || normalizedDealPayload.source === 'Walk-in') {
                    normalizedDealPayload.source = normalizedDealPayload.marketingAttribution?.source || leadDoc.source || normalizedDealPayload.source;
                }
            }

            let activeSiteVisit = null;
            if (linkage?.siteVisitId) {
                try {
                    activeSiteVisit = await ActivityModel.findById(linkage.siteVisitId).session(session);
                } catch (e) {
                    activeSiteVisit = await ActivityModel.findById(linkage.siteVisitId).catch(() => null);
                }
            } else if (linkage?.leadId) {
                try {
                    activeSiteVisit = await ActivityModel.findOne({
                        entityType: 'Lead',
                        entityId: linkage.leadId,
                        type: 'Site Visit',
                        status: 'Completed'
                    }).sort({ completedAt: -1, createdAt: -1 }).session(session);
                } catch (e) {
                    activeSiteVisit = await ActivityModel.findOne({
                        entityType: 'Lead',
                        entityId: linkage.leadId,
                        type: 'Site Visit',
                        status: 'Completed'
                    }).sort({ completedAt: -1, createdAt: -1 }).catch(() => null);
                }
            }

            if (activeSiteVisit) {
                normalizedDealPayload.siteVisitId = activeSiteVisit._id;
                const firstVp = activeSiteVisit.details?.visitedProperties?.[0];
                if (firstVp) {
                    if (!normalizedDealPayload.unitNo && firstVp.property) {
                        normalizedDealPayload.unitNo = firstVp.property;
                    }
                    if (!normalizedDealPayload.projectName && firstVp.project) {
                        normalizedDealPayload.projectName = firstVp.project;
                    }
                    normalizedDealPayload.visitedUnit = firstVp.property || '';
                }
            }

            // 5. Create Deal
            const createdDeals = await Deal.create([normalizedDealPayload], { session });
            deal = createdDeals[0];

            // Link Deal back to initiating Site Visit activity
            if (activeSiteVisit) {
                try {
                    await ActivityModel.findByIdAndUpdate(activeSiteVisit._id, {
                        $set: { 'details.linkedDealId': deal._id },
                        $addToSet: { relatedTo: { id: deal._id, model: 'Deal' } }
                    }, { session });
                } catch (actErr) {
                    console.warn('[DealCreationEngine] Could not link Deal back to Site Visit:', actErr.message);
                }
            }

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
            if ((linkage?.leadId || ownerInfo?.owner || ownerInfo?.buyer) && mongoose.connection?.readyState === 1) {
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
            if (mongoose.connection?.readyState === 1) {
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
        }

        if (!isExternalSession && session && typeof session.commitTransaction === 'function') {
            await session.commitTransaction();
        }
    } catch (err) {
        if (!isExternalSession && session && typeof session.inTransaction === 'function' && session.inTransaction()) {
            await session.abortTransaction();
        }
        if (err.code !== 'IDEMPOTENT_CONFLICT' && err.code !== 'DUPLICATE_DEAL' && err.code !== 'INVENTORY_UNAVAILABLE') {
            err.code = 'TRANSACTION_FAILED';
        }
        throw err;
    } finally {
        if (!isExternalSession && session && typeof session.endSession === 'function') {
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
