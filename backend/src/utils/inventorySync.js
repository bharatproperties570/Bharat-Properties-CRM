import mongoose from 'mongoose';

export const syncInventoryStatus = async (deal, opts = {}, forceTransition = false) => {
    if (!deal.inventoryId) return;

    const Inventory = mongoose.model('Inventory');
    const Lookup = mongoose.model('Lookup');
    const Deal = mongoose.model('Deal');
    const AutomationLog = mongoose.model('AutomationLog');

    const availableLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Available' }).session(opts.session || null).lean();
    const activeLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Active' }).session(opts.session || null).lean();
    
    const availableId = availableLookup ? availableLookup._id : 'Available';
    const activeId = activeLookup ? activeLookup._id : 'Active';

    if (deal.stage === 'Closed' || deal.stage === 'Closed Won') {
        await Inventory.findByIdAndUpdate(deal.inventoryId, { status: 'Sold Out' }, opts);
        if (opts && opts.session) {
            await AutomationLog.create([{
                ruleType: 'DomainEvent',
                targetEntityId: deal.inventoryId,
                targetModule: 'Inventory',
                status: 'pending',
                idempotencyKey: `DomainEvent:INVENTORY_UPDATED:${deal.inventoryId}:${Date.now()}`,
                executedAt: new Date(),
                details: { eventType: 'INVENTORY_UPDATED', entityId: deal.inventoryId, entityType: 'Inventory' }
            }], { session: opts.session });
        }
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
        const result = await Inventory.findOneAndUpdate(filter, { status: 'Blocked' }, opts);
        if (result) {
            if (opts && opts.session) {
                await AutomationLog.create([{
                    ruleType: 'DomainEvent',
                    targetEntityId: deal.inventoryId,
                    targetModule: 'Inventory',
                    status: 'pending',
                    idempotencyKey: `DomainEvent:INVENTORY_UPDATED:${deal.inventoryId}:${Date.now()}`,
                    executedAt: new Date(),
                    details: { eventType: 'INVENTORY_UPDATED', entityId: deal.inventoryId, entityType: 'Inventory' }
                }], { session: opts.session });
            }
        }
        if (!result) {
            const err = new Error(`INVENTORY_UNAVAILABLE: Unit ${deal.inventoryId} cannot transition to Booked/Blocked. It may be reserved or in an invalid state.`);
            err.code = 'INVENTORY_UNAVAILABLE';
            throw err;
        }
        return;
    }

    if (['Cancelled', 'Closed Lost'].includes(deal.stage)) {
        const activeDeals = await Deal.countDocuments({
            inventoryId: deal.inventoryId,
            stage: { $nin: ['Cancelled', 'Closed Lost', 'Closed', 'Closed Won', 'Sold Out'] }
        }).session(opts.session || null);
        
        if (activeDeals === 0) {
            await Inventory.findByIdAndUpdate(deal.inventoryId, { status: 'Available' }, opts);
            if (opts && opts.session) {
                await AutomationLog.create([{
                    ruleType: 'DomainEvent',
                    targetEntityId: deal.inventoryId,
                    targetModule: 'Inventory',
                    status: 'pending',
                    idempotencyKey: `DomainEvent:INVENTORY_UPDATED:${deal.inventoryId}:${Date.now()}`,
                    executedAt: new Date(),
                    details: { eventType: 'INVENTORY_UPDATED', entityId: deal.inventoryId, entityType: 'Inventory' }
                }], { session: opts.session });
            }
        }
        return;
    }

    // For Open / Quote / Negotiation
    // CRM Business Rule: Active Inventory is eligible for new Deals.
    // Duplicate Deal protection is handled at the Deal level, not by hijacking Inventory status.
    const validStates = [ 
        { status: availableId }, 
        { status: activeId }, 
        { status: null }, 
        { status: { $exists: false } } 
    ];
    
    const filter = {
        _id: deal.inventoryId,
        $or: validStates
    };
    
    const result = await Inventory.findOneAndUpdate(filter, { status: 'Active' }, opts);
    if (result) {
        if (opts && opts.session) {
            await AutomationLog.create([{
                ruleType: 'DomainEvent',
                targetEntityId: deal.inventoryId,
                targetModule: 'Inventory',
                status: 'pending',
                idempotencyKey: `DomainEvent:INVENTORY_UPDATED:${deal.inventoryId}:${Date.now()}`,
                executedAt: new Date(),
                details: { eventType: 'INVENTORY_UPDATED', entityId: deal.inventoryId, entityType: 'Inventory' }
            }], { session: opts.session });
        }
    }
    if (!result) {
        const err = new Error(`INVENTORY_UNAVAILABLE: Unit ${deal.inventoryId} cannot transition to Active. It may be reserved or in an invalid state.`);
        err.code = 'INVENTORY_UNAVAILABLE';
        err.inventoryId = deal.inventoryId;
        throw err;
    }
};
