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

            const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
            const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

            const useApi = !!(apiKey && searchEngineId);
            if (!useApi) {
                console.log("[GoogleDiscovery] Missing Google API key or Search Engine ID in .env. Falling back to organic HTML Scraper mode directly!");
            }

            const customsearch = google.customsearch('v1');
            let totalDiscoveredInRun = 0;
            let organicQueryCount = 0;
            const maxOrganicQueries = 5;

            // Generate search queries
            for (const keyword of config.keywords) {
                for (const location of (config.location_filters.length > 0 ? config.location_filters : [''])) {
                    for (const propType of (config.property_types.length > 0 ? config.property_types : [''])) {
                        
                        const queryParts = [keyword, location, propType].filter(Boolean);
                        const query = queryParts.join(' ');
                        
                        if (!query.trim()) continue;

                        if (useApi) {
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
                                    const existingIntake = await Intake.findOne({ 
                                        'raw_source_data.url': url,
                                        source_type: 'public_url' 
                                    });

                                    if (!existingIntake) {
                                        console.log(`[GoogleDiscovery] New URL discovered via API: ${url}`);
                                        await addToIntakeQueue('public_url', { url: url }, null);
                                        totalDiscoveredInRun++;
                                    }
                                }

                                // Rate limit handling
                                await new Promise(resolve => setTimeout(resolve, 1000));

                            } catch (apiErr) {
                                console.warn(`[GoogleDiscovery] Google Custom Search API failed for query '${query}' (${apiErr.message}). Falling back to organic HTML Scraper...`);
                                
                                if (organicQueryCount < maxOrganicQueries) {
                                    organicQueryCount++;
                                    try {
                                        const fallbackUrls = await this.scrapeGoogleSearchFallback(query);
                                        for (const url of fallbackUrls) {
                                            const existingIntake = await Intake.findOne({ 
                                                'raw_source_data.url': url,
                                                source_type: 'public_url' 
                                            });

                                            if (!existingIntake) {
                                                console.log(`[GoogleDiscovery] [Fallback] New URL discovered: ${url}`);
                                                await addToIntakeQueue('public_url', { url: url }, null);
                                                totalDiscoveredInRun++;
                                            }
                                        }
                                        // Wait 3 seconds between organic queries to protect IP reputation
                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                    } catch (fallbackErr) {
                                        console.error(`[GoogleDiscovery] Fallback search also failed:`, fallbackErr.message);
                                    }
                                } else {
                                    console.log(`[GoogleDiscovery] [Organic Max Limit] Skipping organic scraper fallback for '${query}' to prevent search engine rate-limiting.`);
                                }
                            }
                        } else {
                            // Direct HTML Scraper Mode
                            if (organicQueryCount < maxOrganicQueries) {
                                organicQueryCount++;
                                try {
                                    const fallbackUrls = await this.scrapeGoogleSearchFallback(query);
                                    for (const url of fallbackUrls) {
                                        const existingIntake = await Intake.findOne({ 
                                            'raw_source_data.url': url,
                                            source_type: 'public_url' 
                                        });

                                        if (!existingIntake) {
                                            console.log(`[GoogleDiscovery] [Organic] New URL discovered: ${url}`);
                                            await addToIntakeQueue('public_url', { url: url }, null);
                                            totalDiscoveredInRun++;
                                        }
                                    }
                                    // Wait 3 seconds between organic queries to protect IP reputation
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                } catch (scrErr) {
                                    console.error(`[GoogleDiscovery] Organic search failed for query '${query}':`, scrErr.message);
                                }
                            } else {
                                console.log(`[GoogleDiscovery] [Organic Max Limit] Skipping organic search for '${query}' to prevent search engine rate-limiting.`);
                            }
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

    /**
     * Fallback organic search results scraper (No API key or billing required!)
     * @param {String} query 
     * @returns {Array} List of URLs
     */
    async scrapeGoogleSearchFallback(query) {
        try {
            const cheerio = await import('cheerio');
            const axios = await import('axios');
            
            const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
            const response = await axios.default.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
                timeout: 10000
            });

            const $ = cheerio.load(response.data);
            const urls = [];

            // Universal redirect link resolver for Yahoo search pages
            $('a').each((index, element) => {
                let href = $(element).attr('href');
                if (!href) return;

                if (href.includes('r.search.yahoo.com') && href.includes('/RU=')) {
                    try {
                        const rawTarget = href.split('/RU=')[1].split('/')[0];
                        const decoded = decodeURIComponent(rawTarget);
                        
                        if (decoded.startsWith('http') && 
                            !decoded.includes('yahoo.com') && 
                            !decoded.includes('yimg.com') && 
                            !decoded.includes('uservoice.com') && 
                            !decoded.includes('google.com') && 
                            !decoded.includes('youtube.com') && 
                            !decoded.includes('facebook.com') && 
                            !decoded.includes('instagram.com') &&
                            !decoded.includes('twitter.com') &&
                            !decoded.includes('linkedin.com')) {
                            urls.push(decoded.trim());
                        }
                    } catch (err) {
                        // ignore and proceed
                    }
                }
            });

            const uniqueUrls = [...new Set(urls)].slice(0, 10);
            console.log(`[GoogleDiscovery] [Resilient Scraper] Found ${uniqueUrls.length} organic links for query: "${query}"`);
            return uniqueUrls;
        } catch (err) {
            console.error(`[GoogleDiscovery] Resilient search scraping error:`, err.message);
            return [];
        }
    }
}

export default new GoogleDiscoveryService();
