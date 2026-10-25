import { google } from 'googleapis';
import cron from 'node-cron';
import DiscoveryConfig from '../../models/DiscoveryConfig.js';
import Intake from '../../models/Intake.js';
import { addToIntakeQueue } from '../intakeQueue/IntakeQueue.js';
import { normalizeDiscoveryUrl, isPortalAllowed } from './DiscoveryFilterEngine.js';

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
     * Helper to process, validate, normalize, and queue a discovered URL
     * 
     * @param {string} rawUrl 
     * @param {object} config 
     * @param {object} metadata Extra metadata from search result (snippet, dates, etc.)
     * @returns {Promise<{ queued: boolean, reason?: string, url?: string }>}
     */
    async processAndQueueUrl(rawUrl, config, metadata = {}) {
        const normalizedUrl = normalizeDiscoveryUrl(rawUrl);
        if (!normalizedUrl) {
            return { queued: false, reason: 'malformed_url' };
        }

        // 1. Portal Whitelist Enforcement
        const portalCheck = isPortalAllowed(normalizedUrl, config.portal_whitelist);
        if (!portalCheck.allowed) {
            console.log(`[GoogleDiscovery] Excluded URL (${normalizedUrl}): ${portalCheck.reason} [domain: ${portalCheck.domain}]`);
            return { queued: false, reason: portalCheck.reason, url: normalizedUrl };
        }

        // 2. Canonical Deduplication Check (normalized URL and raw URL)
        const existingIntake = await Intake.findOne({ 
            $or: [
                { 'raw_source_data.url': normalizedUrl },
                { 'raw_source_data.normalized_url': normalizedUrl },
                { 'raw_source_data.raw_url': rawUrl }
            ],
            source_type: 'public_url' 
        });

        if (existingIntake) {
            return { queued: false, reason: 'duplicate_already_ingested', url: normalizedUrl };
        }

        // 3. Queue to Unified Intake Engine
        const nowIso = new Date().toISOString();
        const intakePayload = {
            url: normalizedUrl,
            raw_url: rawUrl,
            normalized_url: normalizedUrl,
            source: `Google Discovery: ${config.name}`,
            discovery_config_id: config._id,
            discovery_timestamp: nowIso,
            discovery_filters: {
                price_min: config.price_min,
                price_max: config.price_max,
                size_min: config.size_min,
                size_max: config.size_max,
                size_unit: config.size_unit,
                seller_types: config.seller_types || [],
                portal_whitelist: config.portal_whitelist || [],
                freshness_days: config.freshness_days
            },
            search_metadata: {
                title: metadata.title || null,
                snippet: metadata.snippet || null,
                publishedDate: metadata.publishedDate || null,
                discoveredAt: nowIso,
                query: metadata.query || null,
                source_mode: metadata.source_mode || 'api'
            }
        };

        const result = await addToIntakeQueue('public_url', intakePayload, null);
        return { 
            queued: result?.success || false, 
            heldForReview: result?.heldForReview || false,
            fetchBlocked: result?.fetchBlocked || false,
            reason: result?.reason || null,
            intakeId: result?.intakeId || null,
            url: normalizedUrl 
        };
    }

    /**
     * Checks whether an alternative fallback search provider is explicitly configured and approved.
     * Currently, no secondary automated search provider adapter is authorized or implemented.
     * Environment flags without a documented, verified adapter will NOT trigger external requests.
     * 
     * @returns {boolean}
     */
    isFallbackProviderApproved() {
        return false;
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

            if (!apiKey || !searchEngineId) {
                console.warn("[GoogleDiscovery] Google Custom Search API credentials not configured. Halting discovery run safely.");
                config.last_run_status = 'failed';
                config.last_run_at = new Date();
                await config.save();
                return { success: false, reason: 'google_api_unconfigured', discovered: 0 };
            }

            const customsearch = google.customsearch('v1');
            let totalDiscoveredInRun = 0;

            // Generate search queries
            for (const keyword of config.keywords) {
                for (const location of (config.location_filters?.length > 0 ? config.location_filters : [''])) {
                    for (const propType of (config.property_types?.length > 0 ? config.property_types : [''])) {
                        
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
                            
                            // Process URLs with Phase 1 filter and normalization
                            for (const item of items) {
                                const metaPublishedDate = 
                                    item.pagemap?.metatags?.[0]?.['article:published_time'] || 
                                    item.pagemap?.metatags?.[0]?.['og:updated_time'] || 
                                    null;

                                const queueRes = await this.processAndQueueUrl(item.link, config, {
                                    title: item.title,
                                    snippet: item.snippet,
                                    publishedDate: metaPublishedDate
                                });

                                if (queueRes.queued) {
                                    console.log(`[GoogleDiscovery] New URL discovered via API: ${queueRes.url}`);
                                    totalDiscoveredInRun++;
                                }
                            }

                            // Rate limit handling
                            await new Promise(resolve => setTimeout(resolve, 1000));

                        } catch (apiErr) {
                            const isQuotaExceeded = apiErr.status === 429 || apiErr.code === 429 || /429|quota|rate limit/i.test(apiErr.message);
                            if (isQuotaExceeded) {
                                console.warn(`[GoogleDiscovery] Google Custom Search API quota exhausted (HTTP 429).`);
                            } else {
                                console.warn(`[GoogleDiscovery] Google Custom Search API error: ${apiErr.message}`);
                            }

                            // 🛡️ Quota Fallback Governance:
                            // Never make secondary external search requests or scrape alternate search engines.
                            // Halts safely and records clear status.
                            console.warn(`[GoogleDiscovery] Stopping discovery query safely without unapproved scraping.`);
                            config.urls_discovered_count += totalDiscoveredInRun;
                            config.last_run_at = new Date();
                            config.last_run_status = 'failed';
                            await config.save();
                            return { 
                                success: false, 
                                reason: isQuotaExceeded ? 'google_api_quota_exhausted' : 'google_api_error', 
                                discovered: totalDiscoveredInRun 
                            };
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
            console.error(`[GoogleDiscovery] Job failed for config ${configId}:`, error.message);
            await DiscoveryConfig.findByIdAndUpdate(configId, {
                last_run_at: new Date(),
                last_run_status: 'failed'
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * Decommissioned fallback search scraper.
     * Scraping Yahoo or other unauthorized search engines is strictly disabled for legal compliance and security.
     * 
     * @param {String} query 
     * @param {Array} portalWhitelist 
     * @returns {Promise<Array<{ url: string, title?: string }>>} Empty array (no external requests)
     */
    async scrapeGoogleSearchFallback(query, portalWhitelist = []) {
        console.warn("[GoogleDiscovery] External search fallback is disabled for compliance. No unapproved search requests will be made.");
        return [];
    }
}

export default new GoogleDiscoveryService();
