import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';
import Deal from './models/Deal.js';
import Contact from './models/Contact.js';

dotenv.config();

async function migrate() {
    try {
        console.log("Starting migration...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        // 1. Migrate Inventory
        console.log("\n--- Migrating Inventory ---");
        const inventoryItems = await Inventory.find({});
        console.log(`Found ${inventoryItems.length} inventory items.`);

        for (const item of inventoryItems) {
            let updated = false;

            // Handle legacy "owner" object or string if present
            if (item.ownerName && (!item.owners || item.owners.length === 0)) {
                // Look for contact or create one if needed
                let contact = await Contact.findOne({
                    $or: [
                        { name: item.ownerName },
                        { "phones.number": item.ownerPhone?.replace(/[^0-9]/g, '') }
                    ]
                });

                if (!contact && item.ownerName) {
                    console.log(`Creating contact for owner: ${item.ownerName}`);
                    contact = await Contact.create({
                        name: item.ownerName,
                        phones: item.ownerPhone ? [{ number: item.ownerPhone.replace(/[^0-9]/g, ''), type: 'Personal' }] : [],
                        personalAddress: { area: item.ownerAddress || '' }
                    });
                }

                if (contact) {
                    item.owners = [contact._id];
                    updated = true;
                }
            }

            // Handle associates
            if (item.associatedContact && typeof item.associatedContact === 'object' && item.associatedContact.id) {
                item.associates = [new mongoose.Types.ObjectId(item.associatedContact.id)];
                updated = true;
            } else if (item.associatedPhone && (!item.associates || item.associates.length === 0)) {
                let contact = await Contact.findOne({ "phones.number": item.associatedPhone.replace(/[^0-9]/g, '') });
                if (contact) {
                    item.associates = [contact._id];
                    updated = true;
                }
            }

            if (updated) {
                await item.save();
                console.log(`Updated inventory: ${item.unitNo}`);
            }
        }

        // 2. Migrate Deals
        console.log("\n--- Migrating Deals ---");
        const deals = await Deal.find({});
        console.log(`Found ${deals.length} deals.`);

        for (const deal of deals) {
            let updated = false;

            // Handle owner object
            if (deal.owner && typeof deal.owner === 'object' && !mongoose.Types.ObjectId.isValid(deal.owner)) {
                const ownerObj = deal.owner;
                let contact = await Contact.findOne({
                    $or: [
                        { name: ownerObj.name },
                        { "phones.number": ownerObj.phone?.replace(/[^0-9]/g, '') }
                    ]
                });

                if (!contact && ownerObj.name) {
                    console.log(`Creating contact for deal owner: ${ownerObj.name}`);
                    contact = await Contact.create({
                        name: ownerObj.name,
                        phones: ownerObj.phone ? [{ number: ownerObj.phone.replace(/[^0-9]/g, ''), type: 'Personal' }] : [],
                        emails: ownerObj.email ? [{ address: ownerObj.email, type: 'Personal' }] : []
                    });
                }

                if (contact) {
                    deal.owner = contact._id;
                    updated = true;
                }
            } else if (typeof deal.owner === 'string' && !mongoose.Types.ObjectId.isValid(deal.owner)) {
                let contact = await Contact.findOne({ name: deal.owner });
                if (contact) {
                    deal.owner = contact._id;
                    updated = true;
                }
            }

            // Handle associatedContact object
            if (deal.associatedContact && typeof deal.associatedContact === 'object' && !mongoose.Types.ObjectId.isValid(deal.associatedContact)) {
                const assocObj = deal.associatedContact;
                let contact = await Contact.findOne({
                    $or: [
                        { name: assocObj.name },
                        { "phones.number": assocObj.phone?.replace(/[^0-9]/g, '') }
                    ]
                });

                if (!contact && assocObj.name) {
                    console.log(`Creating contact for deal associate: ${assocObj.name}`);
                    contact = await Contact.create({
                        name: assocObj.name,
                        phones: assocObj.phone ? [{ number: assocObj.phone.replace(/[^0-9]/g, ''), type: 'Personal' }] : [],
                        emails: assocObj.email ? [{ address: assocObj.email, type: 'Personal' }] : []
                    });
                }

                if (contact) {
                    deal.associatedContact = contact._id;
                    updated = true;
                }
            } else if (typeof deal.associatedContact === 'string' && !mongoose.Types.ObjectId.isValid(deal.associatedContact)) {
                let contact = await Contact.findOne({ name: deal.associatedContact });
                if (contact) {
                    deal.associatedContact = contact._id;
                    updated = true;
                }
            }

            if (updated) {
                await deal.save();
                console.log(`Updated deal for unit: ${deal.unitNo}`);
            }
        }

        console.log("\nMigration completed successfully!");
        process.exit();
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
