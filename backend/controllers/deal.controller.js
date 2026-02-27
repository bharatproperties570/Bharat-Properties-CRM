import Deal from "../models/Deal.js";
import Activity from "../models/Activity.js";
import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import { paginate } from "../utils/pagination.js";

export const matchDeals = async (req, res) => {
    try {
        const { leadId } = req.query;
        if (!leadId) {
            return res.status(400).json({ success: false, error: "leadId is required" });
        }

        const lead = await Lead.findById(leadId).lean();
        if (!lead) {
            return res.status(404).json({ success: false, error: "Lead not found" });
        }

        const query = {
            isVisible: { $ne: false },
            stage: { $ne: "Cancelled" }, // Don't show cancelled deals
            $or: []
        };

        if (lead.project) query.$or.push({ projectId: lead.project }, { projectName: lead.project });
        if (lead.requirement) query.$or.push({ category: lead.requirement });
        if (lead.location) query.$or.push({ location: lead.location });

        if (query.$or.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        const populateFields = [
            { path: 'projectId' },
            { path: 'category', select: 'lookup_value' },
            { path: 'status', select: 'lookup_value' }
        ];

        const deals = await Deal.find(query)
            .populate(populateFields)
            .limit(50)
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({ success: true, count: deals.length, data: deals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const syncInventoryStatus = async (deal) => {
    if (!deal.inventoryId) return;

    let targetStatus = 'Available';
    if (deal.stage === 'Closed') {
        targetStatus = 'Sold Out';
    } else if (deal.stage === 'Booked') {
        targetStatus = 'Booked';
    }

    await Inventory.findByIdAndUpdate(deal.inventoryId, { status: targetStatus });
};

export const getDeals = async (req, res) => {
    try {
        const { page = 1, limit = 25, search = "", projectId, inventoryId } = req.query;
        let query = { isVisible: { $ne: false } };

        if (search) {
            query = {
                $or: [
                    { dealId: { $regex: search, $options: "i" } },
                    { unitNo: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } },
                    { projectName: { $regex: search, $options: "i" } }
                ]
            };
        }

        if (projectId) query.projectId = projectId;
        if (inventoryId) query.inventoryId = inventoryId;

        if (req.query.contactId) {
            const contactIds = req.query.contactId.split(',');
            query.$or = query.$or || [];
            query.$or.push(
                { owner: { $in: contactIds } },
                { "partyStructure.owner": { $in: contactIds } },
                { associatedContact: { $in: contactIds } },
                { "partyStructure.buyer": { $in: contactIds } }
            );
        }

        const populateFields = [
            { path: 'inventoryId' },
            { path: 'projectId' },
            { path: 'owner', select: 'name phone email' },
            { path: 'associatedContact', select: 'name phone email' },
            { path: 'assignedTo', select: 'fullName name email' },
            { path: 'partyStructure.buyer', select: 'name phone email' },
            { path: 'partyStructure.channelPartner', select: 'name phone email' },
            { path: 'partyStructure.internalRM', select: 'fullName name email' },
            { path: 'category', select: 'lookup_value' },
            { path: 'subCategory', select: 'lookup_value' },
            { path: 'intent', select: 'lookup_value' },
            { path: 'status', select: 'lookup_value' },
            { path: 'team', select: 'name' }
        ];
        const results = await paginate(Deal, query, Number(page), Number(limit), { createdAt: -1 }, populateFields);

        // Fetch latest activities for owners and associates
        const contactIds = results.records.reduce((acc, deal) => {
            if (deal.owner?._id) acc.push(deal.owner._id);
            if (deal.associatedContact?._id) acc.push(deal.associatedContact._id);
            return acc;
        }, []);

        let activityMap = {};
        if (contactIds.length > 0) {
            const activities = await Activity.aggregate([
                { $match: { entityId: { $in: contactIds }, entityType: "Contact" } },
                { $sort: { performedAt: -1 } },
                { $group: { _id: "$entityId", lastActivity: { $first: "$$ROOT" } } }
            ]);
            activities.forEach(a => {
                activityMap[a._id.toString()] = a.lastActivity;
            });
        }

        // Attach last activity and live owner to each deal
        const enrichedRecords = await Promise.all(results.records.map(async (deal) => {
            const dealObj = deal.toObject ? deal.toObject() : deal;

            // Live Owner Sync: If NOT closed, fetch current owner from inventory
            if (!dealObj.closingDetails?.isClosed && dealObj.inventoryId) {
                const inventory = await Inventory.findById(dealObj.inventoryId).populate('owners');
                if (inventory && inventory.owners && inventory.owners.length > 0) {
                    dealObj.owner = inventory.owners[0];
                }
            }

            // Pick the latest between owner and associate activity
            const ownerId = deal.owner && typeof deal.owner === 'object' ? deal.owner._id : deal.owner;
            const assocId = deal.associatedContact && typeof deal.associatedContact === 'object' ? deal.associatedContact._id : deal.associatedContact;

            const ownerActivity = ownerId ? activityMap[ownerId.toString()] : null;
            const associateActivity = assocId ? activityMap[assocId.toString()] : null;

            dealObj.lastActivity = [ownerActivity, associateActivity]
                .filter(Boolean)
                .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))[0] || null;

            return dealObj;
        }));

        res.json({
            success: true,
            ...results,
            records: enrichedRecords
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getDealById = async (req, res) => {
    try {
        const populateFields = [
            { path: 'inventoryId' },
            { path: 'projectId' },
            { path: 'owner' },
            { path: 'associatedContact' },
            { path: 'assignedTo' },
            { path: 'partyStructure.owner' },
            { path: 'partyStructure.buyer' },
            { path: 'partyStructure.channelPartner' },
            { path: 'partyStructure.internalRM' },
            { path: 'category' },
            { path: 'subCategory' },
            { path: 'intent' },
            { path: 'status' },
            { path: 'team' }
        ];
        const deal = await Deal.findById(req.params.id).populate(populateFields);
        if (!deal) {
            return res.status(404).json({ success: false, error: "Deal not found" });
        }
        res.json({
            success: true,
            data: deal,
            deal: deal // Backward compatibility
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Helper to convert empty strings to null for reference fields to avoid CastError during population
 */
const sanitizeData = (data) => {
    const refFields = [
        'inventoryId', 'projectId', 'unitType', 'propertyType', 'location', 'intent',
        'status', 'dealType', 'transactionType', 'source', 'owner', 'associatedContact',
        'category', 'subCategory', 'assignedTo', 'partyStructure.owner',
        'partyStructure.buyer', 'partyStructure.channelPartner', 'partyStructure.internalRM'
    ];
    const sanitized = { ...data };

    // Recursive sanitizer for nested objects like partyStructure
    const sanitizeValue = (val) => {
        if (val === "" || val === undefined || val === null) return null;
        if (typeof val === 'object' && !Array.isArray(val)) {
            return val._id || null;
        }
        return val;
    };

    refFields.forEach(field => {
        if (field.includes('.')) {
            const parts = field.split('.');
            if (sanitized[parts[0]]) {
                sanitized[parts[0]][parts[1]] = sanitizeValue(sanitized[parts[0]][parts[1]]);
            }
        } else {
            sanitized[field] = sanitizeValue(sanitized[field]);
        }
    });
    return sanitized;
};

export const addDeal = async (req, res) => {
    try {
        const sanitizedData = sanitizeData(req.body);

        // Rule: One Deal per Type per Inventory
        if (sanitizedData.inventoryId && sanitizedData.intent) {
            const existingDeals = await Deal.find({
                inventoryId: sanitizedData.inventoryId,
                intent: sanitizedData.intent
            });

            // 1. If any deal of this type is already 'Closed', lock the type permanently
            const hasClosed = existingDeals.some(d => d.stage === 'Closed');
            if (hasClosed) {
                return res.status(400).json({
                    success: false,
                    error: `This inventory unit has already been Closed for this transaction type. No further deals are allowed.`
                });
            }

            // 2. If any deal is NOT 'Cancelled' (meaning it's active/open), block new ones
            const activeDeal = existingDeals.find(d => d.stage !== 'Cancelled');
            if (activeDeal) {
                const typeName = typeof sanitizedData.intent === 'object' ? sanitizedData.intent?.lookup_value : sanitizedData.intent;
                return res.status(400).json({
                    success: false,
                    error: `An active ${typeName} deal already exists for this inventory unit (#${activeDeal.dealId || activeDeal._id}). Please cancel the existing deal first.`
                });
            }
        }

        const deal = await Deal.create(sanitizedData);
        await syncInventoryStatus(deal);
        res.status(201).json({ success: true, data: deal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateDeal = async (req, res) => {
    try {
        const sanitizedData = sanitizeData(req.body);

        // ━━ Stage History: auto-track if stage is changing ━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (sanitizedData.stage) {
            const existing = await Deal.findById(req.params.id).select('stage stageHistory stageChangedAt createdAt').lean();
            if (existing && existing.stage !== sanitizedData.stage) {
                const now = new Date();
                const historyUpdate = {};

                // Close previous open entry
                if (existing.stageHistory?.length > 0) {
                    const lastIdx = existing.stageHistory.length - 1;
                    const last = existing.stageHistory[lastIdx];
                    if (!last.exitedAt) {
                        const enteredAt = new Date(last.enteredAt || existing.stageChangedAt || existing.createdAt);
                        const daysInStage = Math.floor((now - enteredAt) / 86400000);
                        historyUpdate[`stageHistory.${lastIdx}.exitedAt`] = now;
                        historyUpdate[`stageHistory.${lastIdx}.daysInStage`] = daysInStage;
                    }
                }

                await Deal.findByIdAndUpdate(req.params.id, {
                    $set: historyUpdate,
                    $push: {
                        stageHistory: {
                            stage: sanitizedData.stage,
                            enteredAt: now,
                            triggeredBy: sanitizedData.triggeredBy || 'system',
                            reason: sanitizedData.stageSyncReason || null
                        }
                    }
                });

                sanitizedData.stageChangedAt = now;
            }
        }

        const deal = await Deal.findByIdAndUpdate(req.params.id, sanitizedData, { new: true });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
        await syncInventoryStatus(deal);
        res.json({ success: true, data: deal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteDeal = async (req, res) => {
    try {
        const deal = await Deal.findByIdAndDelete(req.params.id);
        if (!deal) return res.status(404).json({ success: false, error: "Deal not found" });

        // Reset inventory status if the deal was deleted
        if (deal.inventoryId) {
            await Inventory.findByIdAndUpdate(deal.inventoryId, { status: 'Available' });
        }

        res.json({ success: true, message: "Deal deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const bulkDeleteDeals = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: "Invalid IDs provided" });
        }
        await Deal.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, message: `${ids.length} deals deleted successfully` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const importDeals = async (req, res) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: "Invalid data format" });
        }

        const restructuredData = data.map(item => {
            return {
                projectName: item.projectName,
                block: item.block,
                unitNo: item.unitNo,
                unitType: item.unitType,
                propertyType: item.propertyType,
                category: item.category,
                subCategory: item.subCategory,
                size: item.size,
                location: item.location,
                intent: item.intent,
                price: parseFloat(item.price) || 0,
                quotePrice: parseFloat(item.quotePrice) || 0,
                pricingMode: item.pricingMode || 'Total',
                ratePrice: parseFloat(item.ratePrice) || 0,
                quoteRatePrice: parseFloat(item.quoteRatePrice) || 0,
                pricingNature: {
                    negotiable: item.negotiable === 'Yes' || item.negotiable === true,
                    fixed: item.fixed === 'Yes' || item.fixed === true
                },
                status: item.status || 'Open',
                dealType: item.dealType || 'Warm',
                transactionType: item.transactionType || 'Full White',
                flexiblePercentage: parseFloat(item.flexiblePercentage) || 50,
                ownerName: item.ownerName, // Using strict: false or customFields if needed, but schema has owner ref
                ownerPhone: item.ownerPhone,
                ownerEmail: item.ownerEmail,
                associatedContactName: item.associatedContactName,
                associatedContactPhone: item.associatedContactPhone,
                associatedContactEmail: item.associatedContactEmail,
                team: item.team,
                assignedTo: item.assignedTo,
                visibleTo: item.visibleTo || 'Public',
                remarks: item.remarks,
                date: item.date ? new Date(item.date) : new Date()
            };
        });

        await Deal.insertMany(restructuredData, { ordered: false });
        res.status(200).json({ success: true, message: `Successfully imported ${restructuredData.length} deals.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const closeDeal = async (req, res) => {
    try {
        const { id } = req.params;
        const { checklist, closingDate, remarks } = req.body;

        const deal = await Deal.findById(id).populate('inventoryId owner associatedContact partyStructure.buyer');
        if (!deal) return res.status(404).json({ success: false, error: "Deal not found" });

        // Update Deal
        deal.stage = 'Closed';
        deal.closingDetails = {
            isClosed: true,
            closingDate: closingDate || new Date(),
            checklist: checklist,
            remarks: remarks,
            feedbackStatus: { buyerContacted: false, sellerContacted: false }
        };
        await deal.save();

        // Update Inventory Status
        if (deal.inventoryId) {
            await Inventory.findByIdAndUpdate(deal.inventoryId, { status: 'Sold Out' });
        }

        // TODO: Notification trigger
        console.log(`[Notification] Triggering feedback for Deal ${id}`);

        res.json({ success: true, message: "Deal closed successfully", data: deal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
