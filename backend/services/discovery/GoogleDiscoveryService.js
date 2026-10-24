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
        return { queued: result?.success || false, url: normalizedUrl };
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
                for (const location of (config.location_filters?.length > 0 ? config.location_filters : [''])) {
                    for (const propType of (config.property_types?.length > 0 ? config.property_types : [''])) {
                        
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
                                    console.warn(`[GoogleDiscovery] Google Custom Search API quota exhausted (HTTP 429). Falling back to organic HTML Scraper...`);
                                } else {
                                    console.warn(`[GoogleDiscovery] Google Custom Search API failed for query '${query}' (${apiErr.message}). Falling back to organic HTML Scraper...`);
                                }
                                
                                if (organicQueryCount < maxOrganicQueries) {
                                    organicQueryCount++;
                                    try {
                                        const fallbackUrls = await this.scrapeGoogleSearchFallback(query, config.portal_whitelist);
                                        for (const item of fallbackUrls) {
                                            const queueRes = await this.processAndQueueUrl(item.url, config, {
                                                title: item.title,
                                                publishedDate: null
                                            });

                                            if (queueRes.queued) {
                                                console.log(`[GoogleDiscovery] [Fallback] New URL discovered: ${queueRes.url}`);
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
                                    const fallbackUrls = await this.scrapeGoogleSearchFallback(query, config.portal_whitelist);
                                    for (const item of fallbackUrls) {
                                        const queueRes = await this.processAndQueueUrl(item.url, config, {
                                            title: item.title,
                                            publishedDate: null
                                        });

                                        if (queueRes.queued) {
                                            console.log(`[GoogleDiscovery] [Organic] New URL discovered: ${queueRes.url}`);
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
     * 
     * @param {String} query 
     * @param {Array} portalWhitelist 
     * @returns {Array<{ url: string, title?: string }>} List of discovery items
     */
    async scrapeGoogleSearchFallback(query, portalWhitelist = []) {
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
            const items = [];

            // Disallow internal search engine domains
            const isInternalDomain = (u) => {
                const lower = u.toLowerCase();
                return lower.includes('yahoo.com') ||
                    lower.includes('yimg.com') ||
                    lower.includes('uservoice.com') ||
                    lower.includes('google.com') ||
                    lower.includes('bing.com');
            };

            // Universal redirect link resolver for Yahoo search pages
            $('a').each((index, element) => {
                let href = $(element).attr('href');
                let title = $(element).text()?.trim() || '';
                if (!href) return;

                if (href.includes('r.search.yahoo.com') && href.includes('/RU=')) {
                    try {
                        const rawTarget = href.split('/RU=')[1].split('/')[0];
                        const decoded = decodeURIComponent(rawTarget);
                        
                        if (decoded.startsWith('http') && !isInternalDomain(decoded)) {
                            items.push({ url: decoded.trim(), title });
                        }
                    } catch {
                        // ignore and proceed
                    }
                }
            });

            // Deduplicate by normalized URL and enforce portal whitelist
            const seen = new Set();
            const uniqueItems = [];
            for (const item of items) {
                const norm = normalizeDiscoveryUrl(item.url);
                if (norm && !seen.has(norm)) {
                    if (Array.isArray(portalWhitelist) && portalWhitelist.length > 0) {
                        const check = isPortalAllowed(norm, portalWhitelist);
                        if (!check.allowed) continue;
                    }
                    seen.add(norm);
                    uniqueItems.push({ url: norm, title: item.title });
                    if (uniqueItems.length >= 10) break;
                }
            }

            console.log(`[GoogleDiscovery] [Resilient Scraper] Found ${uniqueItems.length} organic links for query: "${query}"`);
            return uniqueItems;
        } catch (err) {
            console.error(`[GoogleDiscovery] Resilient search scraping error:`, err.message);
            return [];
        }
    }
}

export default new GoogleDiscoveryService();
