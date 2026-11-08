/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — AUTHORITY REFRESH SCHEDULER
 *  Phase 4: Weekly Scheduled Refresh Orchestration (Asia/Kolkata)
 * ============================================================================
 * 
 *  1. TIMEZONE CONTRACT: Strict Asia/Kolkata (IST) schedule execution.
 *  2. DISABLED BY DEFAULT: Both schedulingEnabled and isEnabled default to false.
 *  3. FAIL-CLOSED GATE: Scheduled runs strictly evaluate checkActivationEligibility()
 *     and isEffectivelyActive(). If authorizationStatus is NOT_OBTAINED, no live calls run.
 *  4. UNIFORM SECURITY & APPROVAL BOUNDARIES: Scheduled runs create records with
 *     runMode: 'BULK_SCHEDULED' and undergo the exact same review/approval workflow.
 *  5. TENANT ISOLATION: Runs are evaluated and processed strictly per-tenant.
 * 
 *  @module services/authority/AuthorityRefreshScheduler
 *  @version 4.0.0-phase4
 */

import cron from 'node-cron';
import mongoose from 'mongoose';
import AuthoritySourceSettings from '../../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../../models/PropertyVerificationRun.js';
import AuditLog from '../../models/AuditLog.js';
import { AuthorityBulkProcessor } from './AuthorityBulkProcessor.js';
import { CANONICAL_ORGANIZATION_ID } from '../../config/canonicalOrganization.js';

export const DEFAULT_WEEKLY_CRON = '0 2 * * 0'; // Sunday 02:00 AM IST
export const SCHEDULE_TIMEZONE = 'Asia/Kolkata';

export class AuthorityRefreshScheduler {
    constructor(options = {}) {
        this.scheduledTasks = new Map();
        this.isRunning = false;
        this.timezone = options.timezone || SCHEDULE_TIMEZONE;
        this.cronAdapter = options.cronAdapter || cron;

        // Require canonical single-organization context
        const rawOrgId = options.organizationId !== undefined
            ? options.organizationId
            : (options.tenantId !== undefined ? options.tenantId : CANONICAL_ORGANIZATION_ID);

        if (rawOrgId && String(rawOrgId) !== String(CANONICAL_ORGANIZATION_ID)) {
            const err = new Error(`BLOCKED_CANONICAL_ORGANIZATION_MISMATCH: AuthorityRefreshScheduler rejected non-canonical organization ID '${rawOrgId}'. Only canonical organization '${CANONICAL_ORGANIZATION_ID}' is permitted.`);
            err.code = 'BLOCKED_CANONICAL_ORGANIZATION_MISMATCH';
            throw err;
        }

        if (options.organizationId === null || options.tenantId === null || options.useCanonicalDefault === false) {
            this.organizationId = null;
        } else {
            this.organizationId = CANONICAL_ORGANIZATION_ID;
        }
    }

    /**
     * Start the scheduler.
     * Evaluates configuration; fails closed if organization context is missing.
     */
    start() {
        if (this.isRunning) return;

        if (!this.organizationId) {
            throw new Error('SCHEDULER_ORGANIZATION_REQUIRED: Scheduler startup rejected — canonical single-organization ID is required.');
        }

        // Register default weekly cron in Asia/Kolkata timezone
        // The job itself evaluates source settings and fails closed if disabled
        const task = this.cronAdapter.schedule(DEFAULT_WEEKLY_CRON, async () => {
            await this.executeWeeklyCycle({
                isScheduledTrigger: true,
                tenantId: this.organizationId
            });
        }, {
            scheduled: true,
            timezone: this.timezone
        });

        this.scheduledTasks.set('weekly_refresh', task);
        this.isRunning = true;
    }

    /**
     * Stop all scheduled cron tasks.
     */
    stop() {
        for (const [key, task] of this.scheduledTasks.entries()) {
            try {
                task.stop();
            } catch (err) {
                console.error(`[AuthorityRefreshScheduler] Error stopping task ${key}:`, err);
            }
        }
        this.scheduledTasks.clear();
        this.isRunning = false;
    }

    /**
     * Execute the weekly refresh cycle strictly constrained to the single organization.
     * Evaluates fail-closed eligibility before scheduling or executing.
     * 
     * @param {object} options
     * @param {string|mongoose.Types.ObjectId} [options.tenantId] Specific tenant to process (must match bound org)
     * @param {string} [options.authorityCode] Specific authority ('HSVP' | 'CHD' | 'GMADA')
     * @param {boolean} [options.isSimulation=false] Whether this is a test simulation
     * @param {string|mongoose.Types.ObjectId} [options.triggeredBy] Initiator user ID
     * @returns {Promise<object>} Cycle outcome report
     */
    async executeWeeklyCycle(options = {}) {
        if (options.tenantId && String(options.tenantId) !== String(this.organizationId)) {
            const err = new Error(`BLOCKED_CANONICAL_ORGANIZATION_MISMATCH: executeWeeklyCycle rejected mismatched tenantId '${options.tenantId}'. Expected canonical organization ID '${this.organizationId}'.`);
            err.code = 'BLOCKED_CANONICAL_ORGANIZATION_MISMATCH';
            throw err;
        }
        if (options.organizationId && String(options.organizationId) !== String(this.organizationId)) {
            const err = new Error(`BLOCKED_CANONICAL_ORGANIZATION_MISMATCH: executeWeeklyCycle rejected mismatched organizationId '${options.organizationId}'. Expected canonical organization ID '${this.organizationId}'.`);
            err.code = 'BLOCKED_CANONICAL_ORGANIZATION_MISMATCH';
            throw err;
        }

        const targetTenantId = this.organizationId;
        if (!targetTenantId) {
            throw new Error('SCHEDULER_ORGANIZATION_REQUIRED: executeWeeklyCycle requires an explicit organizationId.');
        }

        const { authorityCode, isSimulation = false, triggeredBy = null } = options;
        const authorities = authorityCode ? [authorityCode] : ['HSVP', 'CHD', 'GMADA'];
        const results = [];

        // Single-organization scoped query: strictly forbidden to scan unscoped
        const allSettings = await AuthoritySourceSettings.find({ tenantId: targetTenantId });

        for (const settings of allSettings) {
            if (!authorities.includes(settings.authorityCode)) continue;

            const tId = settings.tenantId;
            const authCode = settings.authorityCode;

            // 1. NON-NEGOTIABLE CHECK: Source must not be paused
            if (settings.isPaused && !isSimulation) {
                results.push({
                    tenantId: tId,
                    authorityCode: authCode,
                    status: 'SKIPPED_SOURCE_PAUSED',
                    reason: 'Source is temporarily paused by circuit breaker.'
                });
                continue;
            }

            // 2. NON-NEGOTIABLE CHECK: schedulingEnabled must be true
            if (!settings.schedulingEnabled && !isSimulation) {
                results.push({
                    tenantId: tId,
                    authorityCode: authCode,
                    status: 'SKIPPED_SCHEDULING_DISABLED',
                    reason: 'schedulingEnabled is false. Weekly scheduled refresh is disabled by default.'
                });
                continue;
            }

            const activationCheck = settings.checkActivationEligibility();
            if (!settings.isEffectivelyActive() && !isSimulation) {
                results.push({
                    tenantId: tId,
                    authorityCode: authCode,
                    status: 'SKIPPED_POLICY_REJECTED',
                    reason: 'Source is not active or permission status is NOT_OBTAINED.',
                    blockers: activationCheck.blockers
                });
                continue;
            }

            // 3. Find eligible active links for this tenant and authority
            const links = await PropertyAuthorityLink.find({
                tenantId: tId,
                authorityCode: authCode,
                isActive: true,
                matchEligibility: { $in: ['ELIGIBLE', 'AMBIGUOUS'] }
            }).select('inventoryId').lean();

            if (links.length === 0) {
                results.push({
                    tenantId: tId,
                    authorityCode: authCode,
                    status: 'NOOP_NO_ELIGIBLE_LINKS',
                    message: 'No active links found for scheduled refresh.'
                });
                continue;
            }

            let inventoryIds = [...new Set(links.map(l => l.inventoryId.toString()))];
            if (options.maxItemsPerAuthority && inventoryIds.length > options.maxItemsPerAuthority) {
                inventoryIds = inventoryIds.slice(0, options.maxItemsPerAuthority);
            }

            // 4. Create and execute scheduled bulk run
            const run = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tId,
                authorityCode: authCode,
                requestedBy: triggeredBy || settings.updatedBy || tId,
                inventoryIds,
                runMode: 'BULK_SCHEDULED',
                isFixtureMode: isSimulation || !settings.isEffectivelyActive()
            }, {
                isSystem: true,
                ipAddress: 'system',
                userAgent: 'AuthorityRefreshScheduler/v4.4.1'
            });

            let processOutcome = null;
            let executionError = null;
            if (run.status === 'CREATED') {
                try {
                    processOutcome = await AuthorityBulkProcessor.processRun(run._id, {
                        tenantId: tId,
                        batchSize: 50,
                        isFixtureMode: isSimulation || !settings.isEffectivelyActive(),
                        isSystem: true,
                        ipAddress: 'system',
                        userAgent: 'AuthorityRefreshScheduler/v4.4.1',
                        portalRuntime: options.portalRuntime,
                        portalOptions: options.portalOptions
                    });
                } catch (procErr) {
                    executionError = procErr;
                }
            }

            // Inspect authoritative persisted run state (Phase 4.4 - Finding F-05)
            const freshRun = await PropertyVerificationRun.findOne({ _id: run._id, tenantId: tId }).lean();
            const finalRunStatus = freshRun?.status || processOutcome?.status || run.status;
            const completedAt = freshRun?.completedAt || new Date();

            let derivedStatus = 'FAILED';
            if (executionError) {
                derivedStatus = 'FAILED';
            } else if (finalRunStatus === 'COMPLETED') {
                derivedStatus = 'SUCCESS';
            } else if (finalRunStatus === 'PARTIAL') {
                derivedStatus = 'PARTIAL';
            } else if (finalRunStatus === 'PAUSED') {
                derivedStatus = 'PAUSED';
            } else if (finalRunStatus === 'CANCELLED') {
                derivedStatus = 'CANCELLED';
            } else if (finalRunStatus === 'POLICY_REJECTED' || finalRunStatus === 'FAILED') {
                derivedStatus = 'FAILED';
            }

            // Update settings last run metadata conditionally so older retries do not overwrite newer runs (Phase 4.4.1 - Finding F-07)
            let settingsUpdateStatus = 'SKIPPED_STALE_RUN';
            let settingsUpdateError = null;
            let updateResult = null;

            try {
                updateResult = await AuthoritySourceSettings.updateOne(
                    {
                        _id: settings._id,
                        tenantId: tId,
                        $or: [
                            { lastRunAt: null },
                            { lastRunAt: { $lte: completedAt } },
                            { lastRunId: run._id }
                        ]
                    },
                    {
                        $set: {
                            lastRunId: run._id,
                            lastRunAt: completedAt,
                            lastRunStatus: derivedStatus
                        }
                    }
                );

                if (updateResult.matchedCount > 0) {
                    settingsUpdateStatus = 'UPDATED';
                    // Update in-memory settings only when database matched and updated
                    settings.lastRunId = run._id;
                    settings.lastRunAt = completedAt;
                    settings.lastRunStatus = derivedStatus;
                } else {
                    // Document was not matched by conditional query: a newer run already ran or exists
                    settingsUpdateStatus = 'SKIPPED_STALE_RUN';
                }
            } catch (dbErr) {
                // Database write failure: do NOT silently suppress, and do NOT treat in-memory settings as updated
                settingsUpdateStatus = 'FAILED';
                settingsUpdateError = dbErr.message;
            }

            results.push({
                tenantId: tId,
                authorityCode: authCode,
                runId: run._id,
                status: finalRunStatus,
                lastRunStatus: derivedStatus,
                settingsUpdateStatus,
                ...(settingsUpdateError ? { settingsUpdateError } : {}),
                totalItems: freshRun?.totalItems || run.totalItems,
                processOutcome,
                ...(executionError ? { error: executionError.message } : {})
            });
        }

        return {
            executedAt: new Date(),
            timezone: this.timezone,
            isSimulation,
            results
        };
    }
}

// Global scheduler singleton
export const authorityScheduler = new AuthorityRefreshScheduler();

export const initAuthorityScheduler = () => {
    authorityScheduler.start();
    return authorityScheduler;
};

export const stopAuthorityScheduler = () => {
    authorityScheduler.stop();
};

export default {
    DEFAULT_WEEKLY_CRON,
    SCHEDULE_TIMEZONE,
    AuthorityRefreshScheduler,
    authorityScheduler,
    initAuthorityScheduler,
    stopAuthorityScheduler
};
