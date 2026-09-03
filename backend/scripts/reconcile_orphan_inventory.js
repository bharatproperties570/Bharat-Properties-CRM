import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env')));
for (const k in envConfig) process.env[k] = envConfig[k];

import Inventory from '../models/Inventory.js';
import Deal from '../models/Deal.js';
import Booking from '../models/Booking.js';
import Lookup from '../models/Lookup.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    
    const isExecute = process.argv.includes('--execute');
    const TARGET_UNIT = '69e708d9119142437aa98cfb';
    
    const activeLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Active' }).lean();
    const availLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Available' }).lean();
    
    if (!activeLookup || !availLookup) {
        console.error("Missing Status Lookups");
        process.exit(1);
    }
    
    let report = {};
    
    await withMongoTransaction(async (session) => {
        // 1. Inventory exists
        const inv = await Inventory.findById(TARGET_UNIT).session(session);
        if (!inv) throw new Error("Inventory not found");
        
        // 2 & 3 & 4. Verify state
        if (inv._id.toString() !== TARGET_UNIT) throw new Error("ID mismatch");
        if (inv.status?.toString() !== activeLookup._id.toString()) throw new Error(`Status is not Active (found ${inv.status})`);
        if (inv.isDeleted === true) throw new Error("Inventory is deleted");
        
        // 5. Query ALL active Deals
        const activeDeals = await Deal.countDocuments({
            inventoryId: TARGET_UNIT,
            stage: { $nin: ['Cancelled', 'Closed Lost'] },
            isDeleted: { $ne: true }
        }).session(session);
        
        // 6. Query ALL active Bookings
        const activeBookings = await Booking.countDocuments({
            property: TARGET_UNIT,
            status: { $ne: 'Cancelled' },
            isDeleted: { $ne: true }
        }).session(session);
        
        // 7. Verify counts
        if (activeDeals !== 0 || activeBookings !== 0) {
            throw new Error(`Unit legitimately claimed. Deals=${activeDeals}, Bookings=${activeBookings}`);
        }
        
        // 8. Check owners/associates claims
        if (inv.owners && inv.owners.length > 0) {
            console.warn(`WARNING: Inventory has ${inv.owners.length} owners but no active deal.`);
        }
        
        report = {
            targetId: TARGET_UNIT,
            currentStatus: 'Active',
            activeDeals,
            activeBookings,
            classification: 'INVALID_ORPHANED_ACTIVE',
            proposedTransition: 'Active -> Available',
            mutation: 'NO'
        };
        
        if (isExecute) {
            // PHASE C - Atomic Repair
            const filter = {
                _id: TARGET_UNIT,
                status: activeLookup._id,
                isDeleted: { $ne: true }
            };
            
            const updateResult = await Inventory.findOneAndUpdate(filter, { status: availLookup._id }, { session, new: true });
            
            if (!updateResult) {
                throw new Error("CONCURRENT_STATE_CHANGE");
            }
            
            // PHASE D - Auditability
            let AuditLog;
            try {
                AuditLog = mongoose.model('AuditLog');
            } catch (e) {
                // If AuditLog doesn't exist, try to define it or use a fallback
            }
            
            if (AuditLog) {
                await AuditLog.create([{
                    entityModel: 'Inventory',
                    entityId: TARGET_UNIT,
                    action: 'UPDATE',
                    actor: 'system',
                    reason: 'ORPHANED_ACTIVE_RECONCILIATION',
                    details: {
                        previousStatus: 'Active',
                        newStatus: 'Available',
                        verifiedActiveDealCount: 0,
                        verifiedActiveBookingCount: 0,
                        script: 'reconcile_orphan_inventory.js'
                    }
                }], { session });
            } else {
                console.warn("AuditLog model not found in this environment. Writing to local JSON log instead.");
                fs.writeFileSync('orphan_repair_audit.json', JSON.stringify({
                    entityModel: 'Inventory',
                    entityId: TARGET_UNIT,
                    action: 'UPDATE',
                    actor: 'system',
                    reason: 'ORPHANED_ACTIVE_RECONCILIATION',
                    timestamp: new Date(),
                    details: { previousStatus: 'Active', newStatus: 'Available' }
                }));
            }
            
            report.mutation = 'YES';
            report.auditCreated = 'YES';
        }
    });

    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
}
run().catch(e => {
    console.error("ABORT:", e.message);
    process.exit(1);
});
