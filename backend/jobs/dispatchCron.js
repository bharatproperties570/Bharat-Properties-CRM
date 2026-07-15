import cron from 'node-cron';
import mongoose from 'mongoose';
import DispatchJob from '../models/DispatchJob.js';
import { executeDispatch } from '../controllers/marketing.controller.js';

export const startDispatchCron = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const jobs = await DispatchJob.find({
                status: 'pending',
                scheduledAt: { $lte: new Date() }
            });

            if (jobs.length > 0) {
                console.log(`[DispatchCron] Found ${jobs.length} pending dispatch jobs.`);
                for (const job of jobs) {
                    try {
                        const payload = {
                            dealIds: job.dealIds,
                            leadIds: job.leadIds,
                            toggles: job.toggles,
                            hidePrice: job.hidePrice,
                            matchContext: job.matchContext
                        };
                        
                        // We run it as 'System' user (null)
                        const result = await executeDispatch(payload, null);
                        
                        job.status = result.success ? 'completed' : 'failed';
                        if (!result.success) job.errorLog = result.message || 'Dispatch failed';
                        await job.save();
                        console.log(`[DispatchCron] Job ${job._id} ${job.status}`);
                    } catch (err) {
                        console.error(`[DispatchCron] Error executing job ${job._id}:`, err);
                        job.status = 'failed';
                        job.errorLog = err.message;
                        await job.save();
                    }
                }
            }
        } catch (error) {
            console.error('[DispatchCron] Polling error:', error);
        }
    });
    console.log('✅ [Cron] DispatchJob Scheduler initialized.');
};
