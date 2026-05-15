import { google } from 'googleapis';
import cron from 'node-cron';
import DiscoveryConfig from '../../models/DiscoveryConfig.js';
import Intake from '../../models/Intake.js';
import { addToIntakeQueue } from '../intakeQueue/IntakeQueue.js';

class GoogleDiscoveryService {
    constructor() {
        this.activeJobs = {}; // Map of configId -> cronJob
    }

    /**
     * Initialize all active discovery jobs from the database
     */
    async initialize() {
        console.log("[GoogleDiscovery] Initializing scheduled jobs...");
        try {
            const configs = await DiscoveryConfig.find({ is_active: true });
            configs.forEach(config => this.scheduleJob(config));
            console.log(`[GoogleDiscovery] Initialized ${configs.length} jobs.`);
        } catch (error) {
            console.error("[GoogleDiscovery] Error initializing jobs:", error);
        }
    }

    /**
     * Schedule a cron job for a given config
     * @param {Object} config DiscoveryConfig document
     */
    scheduleJob(config) {
        if (this.activeJobs[config._id]) {
            this.activeJobs[config._id].stop(); // Stop existing job if updating
        }

        const job = cron.schedule(config.schedule_cron, async () => {
            console.log(`[GoogleDiscovery] Running scheduled job for config: ${config.name}`);
            await this.runDiscovery(config._id);
        });

        this.activeJobs[config._id] = job;
    }

    /**
     * Stop a scheduled job
     * @param {String} configId 
     */
    stopJob(configId) {
        if (this.activeJobs[configId]) {
            this.activeJobs[configId].stop();
            delete this.activeJobs[configId];
        }
    }

    /**
     * Execute a discovery run for a specific config
     * @param {String} configId 
     */
    async runDiscovery(configId) {
        try {
            const config = await DiscoveryConfig.findById(configId);
            if (!config) return;

            // Mark as pending/running
            config.last_run_status = 'pending';
            await config.save();

            const apiKey = process.env.GOOGLE_API_KEY;
            const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

            if (!apiKey || !searchEngineId) {
                throw new Error("Missing Google API credentials");
            }

            const customsearch = google.customsearch('v1');
            let totalDiscoveredInRun = 0;

            // Generate search queries
            for (const keyword of config.keywords) {
                for (const location of (config.location_filters.length > 0 ? config.location_filters : [''])) {
                    for (const propType of (config.property_types.length > 0 ? config.property_types : [''])) {
                        
                        const queryParts = [keyword, location, propType].filter(Boolean);
                        const query = queryParts.join(' ');
                        
                        if (!query.trim()) continue;

                        try {
                            const res = await customsearch.cse.list({
                                cx: searchEngineId,
                                q: query,
                                auth: apiKey,
                                num: 10 // Max per page
                            });

                            const items = res.data.items || [];
                            
                            // Process URLs
                            for (const item of items) {
                                const url = item.link;
                                
                                // Deduplication Check
                                // Have we processed this URL recently?
                                const existingIntake = await Intake.findOne({ 
                                    'raw_source_data.url': url,
                                    source_type: 'public_url' 
                                });

                                if (!existingIntake) {
                                    console.log(`[GoogleDiscovery] New URL discovered: ${url}`);
                                    // Push to intake queue
                                    await addToIntakeQueue('public_url', { url: url }, null);
                                    totalDiscoveredInRun++;
                                }
                            }

                            // Rate limit handling - avoid hitting Google API limits
                            await new Promise(resolve => setTimeout(resolve, 1000));

                        } catch (apiErr) {
                            console.error(`[GoogleDiscovery] Google API Error for query '${query}':`, apiErr.message);
                        }
                    }
                }
            }

            // Update stats
            config.urls_discovered_count += totalDiscoveredInRun;
            config.last_run_at = new Date();
            config.last_run_status = 'success';
            await config.save();

            return { success: true, discovered: totalDiscoveredInRun };

        } catch (error) {
            console.error(`[GoogleDiscovery] Job failed for config ${configId}:`, error);
            await DiscoveryConfig.findByIdAndUpdate(configId, {
                last_run_at: new Date(),
                last_run_status: 'failed'
            });
            return { success: false, message: error.message };
        }
    }
}

export default new GoogleDiscoveryService();
