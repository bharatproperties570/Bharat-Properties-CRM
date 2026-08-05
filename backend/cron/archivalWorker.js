import mongoose from 'mongoose';
import Deal from '../models/Deal.js';
import Activity from '../models/Activity.js';
import cron from 'node-cron';

// Enterprise Archival Rule: 6 months (180 days)
const ARCHIVE_DAYS = 180;

export const runArchivalJob = async () => {
    console.log(`[ArchivalWorker] Starting archival job for Closed Lost deals older than ${ARCHIVE_DAYS} days...`);
    
    try {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - ARCHIVE_DAYS);

        // Find deals that are 'Closed Lost' and haven't been updated/changed since threshold date
        const dealsToArchive = await Deal.find({
            stage: 'Closed Lost',
            $or: [
                { stageChangedAt: { $lt: thresholdDate } },
                { updatedAt: { $lt: thresholdDate } }
            ]
        }).lean();

        if (dealsToArchive.length === 0) {
            console.log(`[ArchivalWorker] No deals to archive today.`);
            return;
        }

        console.log(`[ArchivalWorker] Found ${dealsToArchive.length} deals to archive.`);

        for (const deal of dealsToArchive) {
            // 1. Log final permanent archival note to Inventory
            if (deal.inventoryId) {
                const enteredAt = new Date(deal.createdAt);
                const lostAt = new Date(deal.stageChangedAt || deal.updatedAt);
                const daysActive = Math.max(1, Math.floor((lostAt - enteredAt) / 86400000));

                await Activity.create({
                    entityId: deal.inventoryId,
                    entityType: 'Inventory',
                    type: 'system_note',
                    subType: 'deal_archived',
                    title: `Deal #${deal.dealId || deal._id.toString().slice(-6)} Archived`,
                    description: `This deal was Closed Lost after ${daysActive} days and has now been permanently archived from the active database to save space. Reason for loss was: ${deal.reason || "Not provided"}.`,
                    priority: 'low',
                    status: 'completed',
                    completedAt: new Date()
                });
            }

            // 2. Hard Delete Deal
            await Deal.findByIdAndDelete(deal._id);
            console.log(`[ArchivalWorker] Archived & Deleted Deal ${deal._id}`);
        }

        console.log(`[ArchivalWorker] Archival job completed successfully.`);

    } catch (error) {
        console.error(`[ArchivalWorker] Error during archival job:`, error);
    }
};

// Schedule to run every day at 2:00 AM
export const startArchivalCron = () => {
    cron.schedule('0 2 * * *', runArchivalJob, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });
    console.log(`[ArchivalWorker] Archival cron scheduled at 2:00 AM IST daily.`);
};
