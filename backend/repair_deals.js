import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const mongoUri = process.env.MONGODB_URI;

// Import schemas/models
const InventorySchema = new mongoose.Schema({}, { strict: false });
const DealSchema = new mongoose.Schema({}, { strict: false });

const Inventory = mongoose.models.Inventory || mongoose.model('Inventory', InventorySchema, 'inventories');
const Deal = mongoose.models.Deal || mongoose.model('Deal', DealSchema, 'deals');

async function repair() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB successfully.');

        // Find deals where inventoryId is null
        const brokenDeals = await Deal.find({ inventoryId: null });
        console.log(`Found ${brokenDeals.length} deals with null inventoryId.`);

        for (let deal of brokenDeals) {
            const projName = deal.get('projectName');
            const unitNo = deal.get('unitNo') || deal.get('unitNumber');
            const block = deal.get('block');

            if (!projName || !unitNo) {
                console.log(`Skipping Deal ${deal._id}: missingprojectName or unitNo`);
                continue;
            }

            console.log(`\nAnalyzing Deal: ${deal.get('dealId') || deal._id} (${projName} | Block: ${block || 'N/A'} | Unit: ${unitNo})`);
            
            // Search for matching inventory
            const query = {
                projectName: { $regex: new RegExp(`^${projName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
                $or: [
                    { unitNo: unitNo },
                    { unitNumber: unitNo }
                ]
            };
            if (block) {
                query.block = { $regex: new RegExp(`^${block.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') };
            }

            const inv = await Inventory.findOne(query);
            if (inv) {
                console.log(`Found matching inventory: ${inv._id}`);
                
                const updates = { 
                    inventoryId: inv._id 
                };
                
                if (!deal.get('projectId') && inv.get('projectId')) {
                    updates.projectId = inv.get('projectId');
                }
                if (!deal.get('owner') && inv.get('owners') && inv.get('owners').length > 0) {
                    updates.owner = inv.get('owners')[0];
                }
                if (!deal.get('associatedContact') && inv.get('associates') && inv.get('associates').length > 0) {
                    updates.associatedContact = inv.get('associates')[0].contact;
                }
                if (!deal.get('category') && inv.get('category')) {
                    updates.category = inv.get('category');
                }
                if (!deal.get('propertyType') && inv.get('propertyType')) {
                    updates.propertyType = inv.get('propertyType');
                }
                if (!deal.get('unitType') && inv.get('unitType')) {
                    updates.unitType = inv.get('unitType');
                }

                await Deal.findByIdAndUpdate(deal._id, updates);
                console.log(`Successfully restored references for Deal ID: ${deal._id}`);
            } else {
                console.log(`Could not find a matching inventory for project "${projName}" unit "${unitNo}"`);
            }
        }

        console.log('\nRepair operations completed.');
        process.exit(0);
    } catch (err) {
        console.error('Repair failed:', err);
        process.exit(1);
    }
}

repair();
