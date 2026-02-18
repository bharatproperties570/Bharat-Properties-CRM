import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Contact from './models/Contact.js';
import Inventory from './models/Inventory.js';
import Deal from './models/Deal.js';
import Booking from './models/Booking.js';
import Company from './models/Company.js';

dotenv.config();

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const contacts = await Contact.find({}).lean();
        console.log(`Found ${contacts.length} total contacts.`);

        const phoneMap = new Map();

        // 1. Group contacts by phone numbers
        for (const contact of contacts) {
            const phones = contact.phones || [];
            for (const p of phones) {
                if (!p.number) continue;
                // Normalize number: keep only digits
                const normalized = p.number.replace(/\D/g, '');
                if (!normalized) continue;

                if (!phoneMap.has(normalized)) {
                    phoneMap.set(normalized, []);
                }
                phoneMap.get(normalized).push(contact);
            }
        }

        const duplicateGroups = Array.from(phoneMap.values()).filter(group => group.length > 1);
        console.log(`Found ${duplicateGroups.length} groups of potential duplicates.`);

        let deletedCount = 0;
        let remappedCount = 0;

        // Track seen contact IDs to avoid processing the same duplicate group twice (if they share multiple numbers)
        const processedIds = new Set();

        for (const group of duplicateGroups) {
            // Filter out already processed IDs
            const freshGroup = group.filter(c => !processedIds.has(c._id.toString()));
            if (freshGroup.length < 2) continue;

            // Sort by "completeness" (number of non-null keys) and then by age
            freshGroup.sort((a, b) => {
                const countFields = (obj) => Object.values(obj).filter(v => v != null && v !== "").length;
                const scoreA = countFields(a);
                const scoreB = countFields(b);
                if (scoreB !== scoreA) return scoreB - scoreA;
                return a.createdAt - b.createdAt; // Pick older one if scores same
            });

            const master = freshGroup[0];
            const masterId = master._id;
            const redundant = freshGroup.slice(1);
            const redundantIds = redundant.map(c => c._id);

            console.log(`Merging ${redundantIds.length} contacts into Master: ${master.name} (${masterId})`);

            // Mark all in group as processed
            freshGroup.forEach(c => processedIds.add(c._id.toString()));

            // 2. Remap references

            // Inventory: owners (array), associates (array)
            const invUpdate = await Inventory.updateMany(
                { $or: [{ owners: { $in: redundantIds } }, { associates: { $in: redundantIds } }] },
                [
                    {
                        $set: {
                            owners: {
                                $map: {
                                    input: "$owners",
                                    as: "o",
                                    in: { $cond: [{ $in: ["$$o", redundantIds] }, masterId, "$$o"] }
                                }
                            },
                            associates: {
                                $map: {
                                    input: "$associates",
                                    as: "a",
                                    in: { $cond: [{ $in: ["$$a", redundantIds] }, masterId, "$$a"] }
                                }
                            }
                        }
                    }
                ]
            );
            remappedCount += invUpdate.modifiedCount;

            // Deal: owner, associatedContact, partyStructure.owner, partyStructure.buyer, partyStructure.channelPartner
            const dealUpdate = await Deal.updateMany(
                {
                    $or: [
                        { owner: { $in: redundantIds } },
                        { associatedContact: { $in: redundantIds } },
                        { "partyStructure.owner": { $in: redundantIds } },
                        { "partyStructure.buyer": { $in: redundantIds } },
                        { "partyStructure.channelPartner": { $in: redundantIds } }
                    ]
                },
                [
                    {
                        $set: {
                            owner: { $cond: [{ $in: ["$owner", redundantIds] }, masterId, "$owner"] },
                            associatedContact: { $cond: [{ $in: ["$associatedContact", redundantIds] }, masterId, "$associatedContact"] },
                            "partyStructure.owner": { $cond: [{ $in: ["$partyStructure.owner", redundantIds] }, masterId, "$partyStructure.owner"] },
                            "partyStructure.buyer": { $cond: [{ $in: ["$partyStructure.buyer", redundantIds] }, masterId, "$partyStructure.buyer"] },
                            "partyStructure.channelPartner": { $cond: [{ $in: ["$partyStructure.channelPartner", redundantIds] }, masterId, "$partyStructure.channelPartner"] }
                        }
                    }
                ]
            );
            remappedCount += dealUpdate.modifiedCount;

            // Booking: lead, seller, channelPartner
            const bookingUpdate = await Booking.updateMany(
                {
                    $or: [
                        { lead: { $in: redundantIds } },
                        { seller: { $in: redundantIds } },
                        { channelPartner: { $in: redundantIds } }
                    ]
                },
                [
                    {
                        $set: {
                            lead: { $cond: [{ $in: ["$lead", redundantIds] }, masterId, "$lead"] },
                            seller: { $cond: [{ $in: ["$seller", redundantIds] }, masterId, "$seller"] },
                            channelPartner: { $cond: [{ $in: ["$channelPartner", redundantIds] }, masterId, "$channelPartner"] }
                        }
                    }
                ]
            );
            remappedCount += bookingUpdate.modifiedCount;

            // Company: employees (array)
            const companyUpdate = await Company.updateMany(
                { employees: { $in: redundantIds } },
                [
                    {
                        $set: {
                            employees: {
                                $map: {
                                    input: "$employees",
                                    as: "e",
                                    in: { $cond: [{ $in: ["$$e", redundantIds] }, masterId, "$$e"] }
                                }
                            }
                        }
                    }
                ]
            );
            remappedCount += companyUpdate.modifiedCount;

            // 3. Delete redundant contacts
            await Contact.deleteMany({ _id: { $in: redundantIds } });
            deletedCount += redundantIds.length;
        }

        console.log(`Cleanup complete.`);
        console.log(`Deleted ${deletedCount} duplicate contacts.`);
        console.log(`Updated ${remappedCount} records referencing them.`);

        process.exit(0);
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

cleanup();
