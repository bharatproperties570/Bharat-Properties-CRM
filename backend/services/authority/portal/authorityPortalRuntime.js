/**
 * Authority Portal Runtime — policy-gated orchestration boundary.
 *
 * This module does not contain portal selectors or a network implementation.
 * A source adapter must be supplied only after verified redacted HTML samples,
 * a source-specific approval record, and an independently reviewed policy exist.
 * Distributed lock, shared quota, circuit state and mandatory audit are injected
 * ports; there is deliberately no unsafe in-memory production fallback.
 */

import { getAuthorityPortalDefinition } from './authorityPortalDefinitions.js';
import { buildAuthorityPortalSearchInput } from './authorityPortalSearchMapper.js';
import {
    DEFAULT_APPROVAL_GATE_CONFIG,
    assertAuthorityPortalApproval
} from './authorityPortalApprovalGate.js';
import { assertAuthorityPortalAutomationAllowed } from './authorityPortalSafety.js';
import { guardAuthorityPortalResponse } from './authorityPortalResponseGuard.js';
import {
    sanitizeAuthorityPortalRecord,
    createAuthorityPortalContentHash,
    createAuthorityPortalSearchKey
} from './authorityPortalResultSanitizer.js';
import { AuthorityGlobalFenceWatermark } from '../../../models/AuthorityGlobalFenceWatermark.js';

const EXPECTED_HOSTS = Object.freeze({
    HSVP: 'hsvphry.org.in',
    GMADA: 'gmadaipms.in',
    CHD: 'estateoffice.chd.gov.in'
});

function makeError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = Object.freeze(details);
    return error;
}

function assertRequiredPorts(ports) {
    const required = ['lockProvider', 'quotaProvider', 'circuitBreakerStore', 'transport', 'parserRegistry', 'auditSink'];
    for (const name of required) {
        if (!ports[name]) throw makeError('PORTAL_RUNTIME_DEPENDENCY_MISSING', `Missing required runtime dependency: ${name}`);
    }
    for (const [objectName, method] of [
        ['lockProvider', 'acquire'],
        ['quotaProvider', 'reserve'],
        ['circuitBreakerStore', 'isPaused'],
        ['circuitBreakerStore', 'pause'],
        ['transport', 'search'],
        ['auditSink', 'write']
    ]) {
        if (typeof ports[objectName][method] !== 'function') {
            throw makeError('PORTAL_RUNTIME_DEPENDENCY_INVALID', `${objectName}.${method} must be a function.`);
        }
    }
}

function getTrustedHost(authorityCode, definition) {
    const host = new URL(definition.searchUrl).host.toLowerCase();
    if (host !== EXPECTED_HOSTS[authorityCode]) {
        throw makeError('PORTAL_HOST_NOT_ALLOWLISTED', 'Configured portal host does not match the registered authority host.', {
            authorityCode
        });
    }
    return host;
}

function validateApprovalMatchesAuthority(approval, authorityCode) {
    if (approval.authorityCode && String(approval.authorityCode).toUpperCase() !== authorityCode) {
        throw makeError('PORTAL_APPROVAL_AUTHORITY_MISMATCH', 'Approval record is for a different authority source.');
    }
}

/**
 * @param {object} dependencies
 * @param {object} dependencies.lockProvider Distributed source lock with acquire()
 * @param {object} dependencies.quotaProvider Shared authority-defined quota reservation
 * @param {object} dependencies.circuitBreakerStore Durable per-source pause state
 * @param {object} dependencies.transport Explicitly allow-listed transport with search()
 * @param {object} dependencies.parserRegistry Verified parser by authority code
 * @param {object} dependencies.auditSink Mandatory durable audit writer
 * @param {object} [dependencies.gateConfig] Must be enabled explicitly; default is disabled
 * @param {Function} [dependencies.clock]
 */
export function createAuthorityPortalRuntime(dependencies = {}) {
    const {
        lockProvider,
        quotaProvider,
        circuitBreakerStore,
        transport,
        parserRegistry,
        auditSink,
        lockTtlMs = 30000,
        renewalIntervalMs = null,
        disableHeartbeat = false,
        onRenewTick = null,
        fenceWatermarkStore = AuthorityGlobalFenceWatermark,
        gateConfig = DEFAULT_APPROVAL_GATE_CONFIG,
        clock = () => new Date()
    } = dependencies;

    assertRequiredPorts({ lockProvider, quotaProvider, circuitBreakerStore, transport, parserRegistry, auditSink });

    async function writeAudit(eventType, authorityCode, searchKey, metadata = {}, correlation = {}) {
        // Audit persistence is mandatory; failure blocks the operation.
        await auditSink.write({
            eventType,
            authorityCode,
            searchKey,
            tenantId: correlation.tenantId || null,
            actorId: correlation.actorId || null,
            runId: correlation.runId || null,
            runItemId: correlation.runItemId || null,
            metadata: Object.freeze({ ...metadata }),
            occurredAt: clock()
        });
    }

    async function pauseSource(authorityCode, reason, searchKey, correlation = {}) {
        await circuitBreakerStore.pause({
            authorityCode,
            tenantId: correlation.tenantId || null,
            reason,
            at: clock()
        });
        await writeAudit('AUTHORITY_PORTAL_SOURCE_PAUSED', authorityCode, searchKey, { reason }, correlation);
    }

    const runtimeBundle = {
        lockProvider,
        quotaProvider,
        circuitBreakerStore,
        auditSink,
        transport,
        parserRegistry,
        gateConfig,

        /**
         * Safely initializes authority-global canonical rate policy on the runtime's exact quota provider.
         * Fails closed if quota provider is not configured or fails.
         */
        async initializeCanonicalPolicy({ authorityCode, policy, approvedBy = 'system', policyVersion = 1 } = {}) {
            if (!quotaProvider || typeof quotaProvider.setCanonicalPolicy !== 'function') {
                throw makeError('NO_QUOTA_PROVIDER', 'Configured runtime has no quota provider supporting setCanonicalPolicy.');
            }
            return await quotaProvider.setCanonicalPolicy({
                authorityCode,
                policy,
                approvedBy,
                policyVersion
            });
        },

        async search({
            authorityCode,
            inventory = {},
            authorityLink = {},
            overrides = {},
            approval,
            tenantId = null,
            actorId = null,
            runId = null,
            runItemId = null,
            executeWithinLease = null
        } = {}) {
            const correlation = { tenantId, actorId, runId, runItemId };
            const code = String(authorityCode || '').trim().toUpperCase();
            const definition = getAuthorityPortalDefinition(code);
            const host = getTrustedHost(code, definition);
            const mapped = buildAuthorityPortalSearchInput({
                authorityCode: code,
                inventory,
                authorityLink,
                overrides
            });
            if (!mapped.ready) {
                throw makeError('PORTAL_SEARCH_CRITERIA_INCOMPLETE', 'Required portal search identity fields are missing.', {
                    authorityCode: code,
                    missingGroups: mapped.missingGroups
                });
            }

            const searchKey = createAuthorityPortalSearchKey({ authorityCode: code, criteria: mapped.criteria });
            const sourcePaused = await circuitBreakerStore.isPaused(code, tenantId);

            // Both gates execute before lock/quota/transport; public visibility is not enough.
            assertAuthorityPortalAutomationAllowed({
                policy: { enabled: gateConfig.enabled === true, readOnly: gateConfig.readOnly === true },
                termsReviewed: approval?.termsReviewed === true,
                sourcePaused
            });
            validateApprovalMatchesAuthority(approval, code);
            assertAuthorityPortalApproval({
                authorityCode: code,
                approval,
                now: clock(),
                gate: gateConfig,
                sourcePaused
            });

            if (approval.readOnlySearchAuthorized !== true) {
                throw makeError('PORTAL_READ_ONLY_ONLY', 'Only authority-approved read-only search is supported.');
            }

            const parser = parserRegistry[code];
            if (!parser || typeof parser.parse !== 'function') {
                throw makeError('PORTAL_VERIFIED_PARSER_MISSING', 'No verified parser is registered for this portal.');
            }

            const maxConcurrent = approval.ratePolicy?.maxConcurrentRequests
                || approval.ratePolicy?.maxConcurrent
                || 1;
            const effectiveLockTtlMs = overrides.lockTtlMs || lockTtlMs || 30000;
            const lease = await lockProvider.acquire({
                key: `portal_lock:${code}`,
                authorityCode: code,
                maxConcurrent,
                tenantId: correlation.tenantId,
                ttlMs: effectiveLockTtlMs
            });
            if (!lease || lease.acquired !== true || typeof lease.release !== 'function') {
                throw makeError('PORTAL_SOURCE_BUSY', 'Another worker owns this source or a distributed lock could not be acquired.', {
                    authorityCode: code
                });
            }

            let isRenewing = false;
            let renewalInterval = null;
            let lockLost = false;
            let lockLostError = null;

            try {
                // Durably record issued fence token to establish the issued-but-not-yet-committed watermark window.
                // Fail-closed: Must return a valid persisted record. If it throws, returns null, or returns malformed state,
                // abort before quota reservation and transport. Do not swallow it.
                if (!lease.fenceToken || !Number.isInteger(Number(lease.fenceToken)) || Number(lease.fenceToken) < 1) {
                    throw makeError('PORTAL_FENCE_TOKEN_INVALID', 'Distributed lock returned an invalid or missing fence token.', {
                        authorityCode: code
                    });
                }

                const watermarkDoc = await fenceWatermarkStore.recordIssuedFenceToken({
                    authorityCode: code,
                    fenceToken: lease.fenceToken
                });

                if (!watermarkDoc || typeof watermarkDoc !== 'object' || watermarkDoc.highestIssuedFenceToken < Number(lease.fenceToken)) {
                    throw makeError('PORTAL_FENCE_WATERMARK_PERSISTENCE_FAILED', 'Failed to durably record issued fence token in watermark.', {
                        authorityCode: code
                    });
                }

                const shouldDisableHeartbeat = Boolean(overrides.disableHeartbeat ?? disableHeartbeat);
                if (!shouldDisableHeartbeat && typeof lease.renew === 'function') {
                    const renewPeriodMs = overrides.renewalIntervalMs || renewalIntervalMs || Math.max(50, Math.floor((lease.ttlMs || effectiveLockTtlMs || 30000) / 3));
                    renewalInterval = setInterval(async () => {
                        if (isRenewing || lockLost) return;
                        isRenewing = true;
                        try {
                            const renewed = await lease.renew();
                            if (renewed) {
                                const hook = overrides.onRenewTick || onRenewTick;
                                if (typeof hook === 'function') {
                                    try { hook(lease); } catch {}
                                }
                            } else {
                                lockLost = true;
                                lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost during processing.', {
                                    authorityCode: code
                                });
                            }
                        } catch (err) {
                            lockLost = true;
                            lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', `Distributed portal lock renewal failed: ${err.message}`, {
                                authorityCode: code
                            });
                        } finally {
                            isRenewing = false;
                        }
                    }, renewPeriodMs);
                    if (renewalInterval && typeof renewalInterval.unref === 'function') {
                        renewalInterval.unref();
                    }
                }
                if (lockLost) {
                    throw lockLostError || makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost.', { authorityCode: code });
                }

                const reservation = await quotaProvider.reserve({
                    authorityCode: code,
                    searchKey,
                    tenantId: correlation.tenantId,
                    policy: approval.ratePolicy,
                    at: clock()
                });
                if (!reservation || reservation.allowed !== true) {
                    throw makeError('PORTAL_AUTHORITY_QUOTA_BLOCKED', 'Authority-defined request quota or interval does not permit this request.', {
                        authorityCode: code,
                        reason: reservation?.reason || 'QUOTA_NOT_GRANTED'
                    });
                }
                await writeAudit('AUTHORITY_PORTAL_SEARCH_REQUESTED', code, searchKey, {
                    searchMode: mapped.searchMode,
                    host,
                    quotaReservationId: reservation.reservationId || null
                }, correlation);

                // Actively verify lease ownership before network request
                if (typeof lease.renew === 'function') {
                    const stillOwned = await lease.renew();
                    if (!stillOwned) {
                        lockLost = true;
                        lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost before transport request.', {
                            authorityCode: code
                        });
                    }
                }
                if (lockLost) {
                    throw lockLostError || makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost before transport search.', { authorityCode: code });
                }

                let response;
                try {
                    response = await transport.search({
                        authorityCode: code,
                        definition,
                        criteria: mapped.criteria,
                        readOnly: true,
                        followRedirects: false
                    });
                } catch (transportError) {
                    if (transportError.details?.pauseSource === true) {
                        await pauseSource(code, transportError.details.reason || transportError.code, searchKey, correlation);
                    }
                    await writeAudit('AUTHORITY_PORTAL_TRANSPORT_FAILED', code, searchKey, {
                        errorCode: transportError?.code || 'TRANSPORT_ERROR'
                    }, correlation);
                    throw transportError;
                }

                // Actively verify lease ownership before parsing response
                if (typeof lease.renew === 'function') {
                    const stillOwned = await lease.renew();
                    if (!stillOwned) {
                        lockLost = true;
                        lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost before parsing response.', {
                            authorityCode: code
                        });
                    }
                }
                if (lockLost) {
                    throw lockLostError || makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost before response parsing.', { authorityCode: code });
                }

                let guarded;
                try {
                    guarded = guardAuthorityPortalResponse({
                        authorityCode: code,
                        response,
                        expectedUrl: definition.searchUrl
                    });
                } catch (guardError) {
                    if (guardError.details?.pauseSource === true) {
                        await pauseSource(code, guardError.details.reason || guardError.code, searchKey, correlation);
                    }
                    await writeAudit('AUTHORITY_PORTAL_RESPONSE_REJECTED', code, searchKey, {
                        errorCode: guardError.code || 'RESPONSE_REJECTED',
                        status: guardError.details?.status || null
                    }, correlation);
                    throw guardError;
                }

                let parsed;
                try {
                    parsed = await parser.parse(guarded.body, {
                        authorityCode: code,
                        searchMode: mapped.searchMode,
                        criteria: mapped.criteria,
                        permittedFields: approval.permittedFields
                    });
                } catch (parseError) {
                    await writeAudit('AUTHORITY_PORTAL_PARSE_FAILED', code, searchKey, {
                        errorCode: parseError?.code || 'PARSER_ERROR'
                    }, correlation);
                    throw makeError('PORTAL_PARSE_FAILED', 'Verified portal parser failed; no record was persisted.', {
                        authorityCode: code
                    });
                }

                // Actively verify lease ownership after parser completion
                if (typeof lease.renew === 'function') {
                    const stillOwned = await lease.renew();
                    if (!stillOwned) {
                        lockLost = true;
                        lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost after parser completion.', {
                            authorityCode: code
                        });
                    }
                }
                if (lockLost) {
                    throw lockLostError || makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost after parser completion.', { authorityCode: code });
                }

                if (!Array.isArray(parsed)) {
                    throw makeError('PORTAL_PARSER_CONTRACT_INVALID', 'Portal parser must return an array of record objects.');
                }
                if (parsed.length > 100) {
                    throw makeError('PORTAL_RESULT_COUNT_EXCEEDED', 'Portal parser returned more records than the approved per-query result ceiling.');
                }

                const records = parsed.map((record) => sanitizeAuthorityPortalRecord(record, approval.permittedFields));
                const contentHash = createAuthorityPortalContentHash(records);

                // Verify lease ownership immediately before writing completed audit
                if (lockLost) {
                    throw lockLostError || makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost before audit completion.', { authorityCode: code });
                }

                try {
                    await writeAudit('AUTHORITY_PORTAL_SEARCH_COMPLETED', code, searchKey, {
                        recordCount: records.length,
                        contentHash,
                        parserVersion: parser.version || null
                    }, correlation);
                } catch (auditErr) {
                    throw makeError('PORTAL_AUDIT_WRITE_FAILED', `Audit write failed at final boundary; aborting: ${auditErr.message}`, {
                        authorityCode: code
                    });
                }

                // Verify lease ownership was not lost during audit write
                if (lockLost) {
                    throw lockLostError || makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost during audit completion.', { authorityCode: code });
                }

                const result = Object.freeze({
                    authorityCode: code,
                    sourceHost: host,
                    observedAt: clock(),
                    searchMode: mapped.searchMode,
                    criteriaHash: searchKey,
                    recordCount: records.length,
                    records: Object.freeze(records),
                    contentHash,
                    fenceToken: lease.fenceToken ?? null,
                    isCurrentFence: async () => {
                        if (lockLost) return false;
                        if (typeof lockProvider.isCurrentFenceToken === 'function') {
                            const isCurrent = await lockProvider.isCurrentFenceToken(code, lease.fenceToken);
                            if (!isCurrent) {
                                lockLost = true;
                                return false;
                            }
                        }
                        try {
                            const isSuperseded = await fenceWatermarkStore.isFenceTokenSuperseded({
                                authorityCode: code,
                                fenceToken: lease.fenceToken
                            });
                            if (isSuperseded) {
                                lockLost = true;
                                return false;
                            }
                        } catch (err) {
                            lockLost = true;
                            throw err;
                        }
                        return !lockLost;
                    },
                    isLeaseValid: async () => {
                        if (lockLost) return false;
                        if (typeof lease.renew === 'function') {
                            try {
                                const renewed = await lease.renew();
                                if (!renewed) {
                                    lockLost = true;
                                    return false;
                                }
                            } catch {
                                lockLost = true;
                                return false;
                            }
                        }
                        if (typeof lockProvider.isCurrentFenceToken === 'function') {
                            const isCurrent = await lockProvider.isCurrentFenceToken(code, lease.fenceToken);
                            if (!isCurrent) {
                                lockLost = true;
                                return false;
                            }
                        }
                        try {
                            const isSuperseded = await fenceWatermarkStore.isFenceTokenSuperseded({
                                authorityCode: code,
                                fenceToken: lease.fenceToken
                            });
                            if (isSuperseded) {
                                lockLost = true;
                                return false;
                            }
                        } catch (err) {
                            lockLost = true;
                            throw err;
                        }
                        return !lockLost;
                    },
                    checkLeaseValid: async () => {
                        if (lockLost) {
                            throw lockLostError || makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost.', { authorityCode: code });
                        }
                        if (typeof lease.renew === 'function') {
                            let renewed = false;
                            try {
                                renewed = await lease.renew();
                            } catch (e) {
                                lockLost = true;
                                lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', `Distributed portal lock renewal failed: ${e.message}`, { authorityCode: code });
                                throw lockLostError;
                            }
                            if (!renewed) {
                                lockLost = true;
                                lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock expired or renewed by another worker.', { authorityCode: code });
                                throw lockLostError;
                            }
                        }
                        if (typeof lockProvider.isCurrentFenceToken === 'function') {
                            const isCurrent = await lockProvider.isCurrentFenceToken(code, lease.fenceToken);
                            if (!isCurrent) {
                                lockLost = true;
                                lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock superseded by a newer fence token.', { authorityCode: code });
                                throw lockLostError;
                            }
                        }
                        try {
                            const isSuperseded = await fenceWatermarkStore.isFenceTokenSuperseded({
                                authorityCode: code,
                                fenceToken: lease.fenceToken
                            });
                            if (isSuperseded) {
                                lockLost = true;
                                lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Portal fence token was superseded in global watermark.', { authorityCode: code });
                                throw lockLostError;
                            }
                        } catch (wmErr) {
                            lockLost = true;
                            if (wmErr.code === 'PORTAL_LOCK_OWNERSHIP_LOST') throw wmErr;
                            lockLostError = makeError('PORTAL_LOCK_OWNERSHIP_LOST', `Portal fence watermark validation failed: ${wmErr.message}`, {
                                authorityCode: code,
                                cause: wmErr
                            });
                            throw lockLostError;
                        }
                    },
                    provenance: 'LIVE',
                    isSynthetic: false,
                    requiresHumanReview: true,
                    isApplied: false,
                    rawPortalResponsePersisted: false
                });

                // Phase 6: Maintain lease ownership through candidate creation, snapshot persistence and run-item terminal finalization
                if (typeof executeWithinLease === 'function') {
                    const callbackResult = await executeWithinLease(result);
                    // If callback already safely aborted due to ownership loss / watermark supersedence, return callbackResult cleanly
                    if (callbackResult && (callbackResult.ownershipLost === true || callbackResult.code === 'PORTAL_LOCK_OWNERSHIP_LOST')) {
                        return callbackResult;
                    }
                    // Verify lease was not lost during persistence callback
                    if (lockLost) {
                        throw lockLostError || makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock ownership was lost during snapshot persistence.', { authorityCode: code });
                    }
                    if (typeof lease.renew === 'function') {
                        const stillOwned = await lease.renew();
                        if (!stillOwned) {
                            throw makeError('PORTAL_LOCK_OWNERSHIP_LOST', 'Distributed portal lock expired during snapshot persistence.', { authorityCode: code });
                        }
                    }
                    return callbackResult;
                }

                return result;
            } catch (error) {
                // Safety stops are persisted exactly once in the response-guard boundary.
                // No automatic retry for quota denial, 403, 429, challenge, login or parser errors.
                throw error;
            } finally {
                if (renewalInterval) {
                    clearInterval(renewalInterval);
                }
                await lease.release();
            }
        }
    };

    runtimeBundle.runtime = runtimeBundle;
    return Object.freeze(runtimeBundle);
}

export { EXPECTED_HOSTS };
