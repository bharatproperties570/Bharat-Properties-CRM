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

    return Object.freeze({
        async search({
            authorityCode,
            inventory = {},
            authorityLink = {},
            overrides = {},
            approval,
            tenantId = null,
            actorId = null,
            runId = null,
            runItemId = null
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

            const lease = await lockProvider.acquire({
                key: `authority-portal:${code}`,
                searchKey,
                authorityCode: code,
                tenantId: correlation.tenantId
            });
            if (!lease || lease.acquired !== true || typeof lease.release !== 'function') {
                throw makeError('PORTAL_SOURCE_BUSY', 'Another worker owns this source or a distributed lock could not be acquired.', {
                    authorityCode: code
                });
            }

            let renewalInterval = null;
            let lockLost = false;
            let lockLostError = null;

            if (typeof lease.renew === 'function') {
                const renewPeriodMs = Math.max(50, Math.floor((lease.ttlMs || 30000) / 3));
                renewalInterval = setInterval(async () => {
                    try {
                        const renewed = await lease.renew();
                        if (!renewed) {
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
                    }
                }, renewPeriodMs);
                if (renewalInterval && typeof renewalInterval.unref === 'function') {
                    renewalInterval.unref();
                }
            }

            try {
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

                if (!Array.isArray(parsed)) {
                    throw makeError('PORTAL_PARSER_CONTRACT_INVALID', 'Portal parser must return an array of record objects.');
                }
                if (parsed.length > 100) {
                    throw makeError('PORTAL_RESULT_COUNT_EXCEEDED', 'Portal parser returned more records than the approved per-query result ceiling.');
                }

                const records = parsed.map((record) => sanitizeAuthorityPortalRecord(record, approval.permittedFields));
                const contentHash = createAuthorityPortalContentHash(records);
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
                    provenance: 'LIVE',
                    isSynthetic: false,
                    requiresHumanReview: true,
                    isApplied: false,
                    rawPortalResponsePersisted: false
                });

                await writeAudit('AUTHORITY_PORTAL_SEARCH_COMPLETED', code, searchKey, {
                    recordCount: records.length,
                    contentHash,
                    parserVersion: parser.version || null
                }, correlation);

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
    });
}

export { EXPECTED_HOSTS };
