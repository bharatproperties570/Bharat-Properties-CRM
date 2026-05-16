import cron from 'node-cron';
import AutomatedIntakeSource from '../../models/AutomatedIntakeSource.js';
import { addToIntakeQueue } from './IntakeQueue.js';

class AutomatedIntakeService {
    constructor() {
        this.activeJobs = {}; // Map of sourceId -> cronJob
    }

    /**
     * Initialize all active automated intake sources on startup
     */
    async initialize() {
        console.log("[AutoIntake] Initializing automated source monitors...");
        try {
            const sources = await AutomatedIntakeSource.find({ is_active: true });
            sources.forEach(source => this.scheduleSource(source));
            console.log(`[AutoIntake] Scheduled ${sources.length} sources for monitoring.`);
        } catch (error) {
            console.error("[AutoIntake] Error initializing automated sources:", error);
        }
    }

    /**
     * Schedule or re-schedule a cron job for a specific source
     * @param {Object} source AutomatedIntakeSource document
     */
    scheduleSource(source) {
        // Stop existing job if it's already running (for updates)
        this.stopSource(source._id);

        const cronSchedule = this.getCronExpression(source.frequency, source.schedule_cron);
        
        const job = cron.schedule(cronSchedule, async () => {
            console.log(`[AutoIntake] Running scheduled monitor for: ${source.url}`);
            await this.runMonitor(source._id);
        });

        this.activeJobs[source._id.toString()] = job;
    }

    /**
     * Stop a scheduled monitor
     */
    stopSource(sourceId) {
        const idStr = sourceId.toString();
        if (this.activeJobs[idStr]) {
            this.activeJobs[idStr].stop();
            delete this.activeJobs[idStr];
        }
    }

    /**
     * Execute a single run for a source
     */
    async runMonitor(sourceId) {
        try {
            const source = await AutomatedIntakeSource.findById(sourceId);
            if (!source || !source.is_active) return;

            source.last_run_status = 'pending';
            await source.save();

            // Trigger the intake queue
            // We use 'public_url' as the source type
            const result = await addToIntakeQueue('public_url', { 
                url: source.url,
                source: source.source || 'Automated Monitor',
                automated_source_id: source._id 
            }, source.createdBy);

            if (result.success) {
                source.last_run_at = new Date();
                source.last_run_status = 'success';
            } else {
                throw new Error(result.message || "Failed to add to queue");
            }
            
            await source.save();
            console.log(`[AutoIntake] Successfully queued monitor run for ${source.url}`);

        } catch (error) {
            console.error(`[AutoIntake] Monitor failed for source ${sourceId}:`, error.message);
            await AutomatedIntakeSource.findByIdAndUpdate(sourceId, {
                last_run_status: 'failed',
                $push: { 
                    error_log: { 
                        timestamp: new Date(), 
                        message: error.message 
                    } 
                }
            });
        }
    }

    /**
     * Helper to get cron expression based on frequency
     */
    getCronExpression(frequency, customCron) {
        switch (frequency) {
            case 'hourly': return '0 * * * *';
            case 'daily': return '0 0 * * *';
            case 'weekly': return '0 0 * * 0';
            default: return customCron || '0 0 * * *';
        }
    }
}

export default new AutomatedIntakeService();
