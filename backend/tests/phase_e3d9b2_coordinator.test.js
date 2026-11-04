/**
 * Phase E.3-D.9-B2-B — Execution-Owner Coordinator Test Suite
 *
 * Verifies:
 * - Two-tier coordination architecture (Tier 1: Macro-Routing, Tier 2: Micro-Fencing)
 * - Default fail-safe to LEGACY on missing configuration or DB errors
 * - Monotonic epoch incrementing and optimistic locking
 * - In-memory TTL caching and explicit invalidation
 * - Authority validation for LEGACY, DURABLE, TRANSITIONING, DISABLED
 * - Dynamic drain barrier calculation
 * - Pre-dispatch fencing check (rejecting expired leases prior to external dispatch)
 * - Operator rollback protocol (DURABLE -> LEGACY)
 * - Multi-instance view skew protection via canonical claim
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { WorkflowEngine } from '../src/utils/WorkflowEngine.js';
import { processDomainEvent } from '../src/workers/domainEventWorker.js';
import AutomationLog from '../models/AutomationLog.js';
import SystemSetting from '../models/SystemSetting.js';
import Trigger from '../models/Trigger.js';
import {
    getExecutionOwner,
    validateExecutionAuthority,
    updateExecutionOwner,
    getPendingClaimsCount,
    clearCache,
    COORDINATOR_KEY,
    EXECUTION_OWNERS,
    DEFAULT_FALLBACK_STATE
} from '../src/utils/executionCoordinator.js';

describe('Phase E.3-D.9-B2-B — Execution-Owner Coordinator Suite', () => {
    let mockSystemSettings;
    let mockAutomationLogs;
    let mockTriggers;
    let mockEntities;

    const origSystemSettingFindOne = SystemSetting.findOne;
    const origSystemSettingFindOneAndUpdate = SystemSetting.findOneAndUpdate;
    const origAutoLogFindOne = AutomationLog.findOne;
    const origAutoLogCreate = AutomationLog.create;
    const origAutoLogUpdateOne = AutomationLog.updateOne;
    const origAutoLogFindOneAndUpdate = AutomationLog.findOneAndUpdate;
    const origAutoLogCountDocuments = AutomationLog.countDocuments;
    const origTriggerFind = Trigger.find;
    const origMongooseModel = mongoose.model;

    beforeEach(() => {
        clearCache();
        mockSystemSettings = new Map();
        mockAutomationLogs = new Map();
        mockTriggers = [];
        mockEntities = new Map();

        // ── Mock SystemSetting ──
        SystemSetting.findOne = (query) => {
            const doc = mockSystemSettings.get(query.key);
            return {
                lean: async () => (doc ? JSON.parse(JSON.stringify(doc)) : null),
                ...(doc ? JSON.parse(JSON.stringify(doc)) : {})
            };
        };

        SystemSetting.findOneAndUpdate = async (query, update, options) => {
            let doc = mockSystemSettings.get(query.key);
            if (!doc && options?.upsert) {
                doc = { key: query.key, value: {} };
            }
            if (doc && update.$set) {
                Object.assign(doc, update.$set);
                if (update.$set.value) {
                    doc.value = Object.assign(doc.value || {}, update.$set.value);
                }
            }
            mockSystemSettings.set(query.key, doc);
            return JSON.parse(JSON.stringify(doc));
        };

        // ── Mock AutomationLog ──
        AutomationLog.findOne = (query) => {
            const doc = mockAutomationLogs.get(query.idempotencyKey);
            return {
                lean: async () => (doc ? JSON.parse(JSON.stringify(doc)) : null),
                ...(doc ? JSON.parse(JSON.stringify(doc)) : {})
            };
        };

        AutomationLog.create = async (docData) => {
            if (docData.idempotencyKey && mockAutomationLogs.has(docData.idempotencyKey)) {
                const err = new Error('E11000 duplicate key error');
                err.code = 11000;
                throw err;
            }
            const doc = {
                ...docData,
                _id: `log-${Date.now()}-${Math.random()}`,
                executedAt: new Date()
            };
            if (docData.idempotencyKey) {
                mockAutomationLogs.set(docData.idempotencyKey, doc);
            }
            return doc;
        };

        AutomationLog.updateOne = async (filter, update) => {
            const key = filter.idempotencyKey;
            const doc = mockAutomationLogs.get(key);
            if (!doc) return { matchedCount: 0, modifiedCount: 0 };
            if (filter.claimToken && doc.claimToken !== filter.claimToken) {
                return { matchedCount: 0, modifiedCount: 0 };
            }
            if (update.$set) {
                Object.assign(doc, update.$set);
            }
            mockAutomationLogs.set(key, doc);
            return { matchedCount: 1, modifiedCount: 1 };
        };

        AutomationLog.findOneAndUpdate = async (filter, update) => {
            const key = filter.idempotencyKey;
            const doc = mockAutomationLogs.get(key);
            if (!doc) return null;
            if (filter.status && doc.status !== filter.status) return null;
            if (filter['leaseUntil'] && filter['leaseUntil'].$lte) {
                if (doc.leaseUntil && new Date(doc.leaseUntil) > filter['leaseUntil'].$lte) {
                    return null;
                }
            }
            if (update.$set) {
                Object.assign(doc, update.$set);
            }
            mockAutomationLogs.set(key, doc);
            return JSON.parse(JSON.stringify(doc));
        };

        AutomationLog.countDocuments = async (query) => {
            let count = 0;
            const now = query?.leaseUntil?.$gt ? new Date(query.leaseUntil.$gt) : new Date();
            for (const [key, doc] of mockAutomationLogs.entries()) {
                if (query?.idempotencyKey?.$regex && !query.idempotencyKey.$regex.test(key)) {
                    continue;
                }
                if (query?.status && doc.status !== query.status) {
                    continue;
                }
                if (query?.leaseUntil?.$gt && (!doc.leaseUntil || new Date(doc.leaseUntil) <= now)) {
                    continue;
                }
                count++;
            }
            return count;
        };

        // ── Mock Trigger ──
        Trigger.find = (q) => ({
            sort: () => mockTriggers.filter(t =>
                (!q.module || t.module === q.module) &&
                (!q.event || t.event === q.event) &&
                t.isActive !== false
            )
        });

        // ── Mock mongoose.model ──
        mongoose.model = (name) => {
            if (name === 'SystemSetting') return SystemSetting;
            if (name === 'AutomationLog') return AutomationLog;
            if (name === 'Trigger') return Trigger;
            return {
                findById: (id) => ({
                    lean: async () => mockEntities.get(`${name}:${id}`) || null,
                    select: () => ({
                        lean: async () => mockEntities.get(`${name}:${id}`) || null
                    })
                }),
                findByIdAndUpdate: async (id, update) => {
                    const entity = mockEntities.get(`${name}:${id}`) || {};
                    Object.assign(entity, update.$set || update);
                    mockEntities.set(`${name}:${id}`, entity);
                    return entity;
                }
            };
        };
    });

    afterEach(() => {
        clearCache();
        SystemSetting.findOne = origSystemSettingFindOne;
        SystemSetting.findOneAndUpdate = origSystemSettingFindOneAndUpdate;
        AutomationLog.findOne = origAutoLogFindOne;
        AutomationLog.create = origAutoLogCreate;
        AutomationLog.updateOne = origAutoLogUpdateOne;
        AutomationLog.findOneAndUpdate = origAutoLogFindOneAndUpdate;
        AutomationLog.countDocuments = origAutoLogCountDocuments;
        Trigger.find = origTriggerFind;
        mongoose.model = origMongooseModel;
    });

    const createJob = (id, eventType, entityType, entityId) => ({
        id,
        data: {
            eventId: id,
            eventType,
            entityType,
            entityId,
            occurredAt: new Date().toISOString(),
            payload: { dealId: entityId, stage: 'Open' }
        }
    });

    // ── COORD-1: Default Fail-Safe to LEGACY ──
    it('COORD-1: Unconfigured coordinator defaults fail-safe to LEGACY mode (epoch 0)', async () => {
        const state = await getExecutionOwner();
        assert.equal(state.owner, EXECUTION_OWNERS.LEGACY);
        assert.equal(state.epoch, 0);
        assert.equal(state.isDefault, true);

        const legacyAuth = await validateExecutionAuthority('LEGACY', 'deal_created');
        assert.equal(legacyAuth.authorized, true);
        assert.equal(legacyAuth.owner, 'LEGACY');

        const durableAuth = await validateExecutionAuthority('DURABLE', 'deal_created');
        assert.equal(durableAuth.authorized, false);
        assert.equal(durableAuth.reason, 'AUTHORITY_HELD_BY_LEGACY');
    });

    // ── COORD-2: Database / Network Error Fail-Safe ──
    it('COORD-2: Coordinator query failure safely falls back to LEGACY with zero unhandled exceptions', async () => {
        SystemSetting.findOne = () => {
            throw new Error('MongoNetworkTimeoutException: connection dropped');
        };

        const state = await getExecutionOwner({ bypassCache: true });
        assert.equal(state.owner, EXECUTION_OWNERS.LEGACY);
        assert.equal(state.epoch, 0);

        const legacyAuth = await validateExecutionAuthority('LEGACY', 'deal_created', { bypassCache: true });
        assert.equal(legacyAuth.authorized, true);

        const durableAuth = await validateExecutionAuthority('DURABLE', 'deal_created', { bypassCache: true });
        assert.equal(durableAuth.authorized, false);
    });

    // ── COORD-3: Monotonic Epoch Increment & Optimistic Concurrency ──
    it('COORD-3: updateExecutionOwner strictly increments epoch monotonically and rejects mismatched expectedEpoch', async () => {
        const step1 = await updateExecutionOwner(EXECUTION_OWNERS.TRANSITIONING, {
            updatedBy: 'admin-1',
            reason: 'Initiate cutover'
        });
        assert.equal(step1.owner, EXECUTION_OWNERS.TRANSITIONING);
        assert.equal(step1.epoch, 1);

        const step2 = await updateExecutionOwner(EXECUTION_OWNERS.DURABLE, {
            updatedBy: 'admin-1',
            reason: 'Promote to durable',
            expectedEpoch: 1
        });
        assert.equal(step2.owner, EXECUTION_OWNERS.DURABLE);
        assert.equal(step2.epoch, 2);

        // Optimistic locking rejection
        await assert.rejects(
            async () => {
                await updateExecutionOwner(EXECUTION_OWNERS.LEGACY, {
                    expectedEpoch: 1 // Actual epoch is 2
                });
            },
            /Concurrent modification detected: expected epoch 1, but found 2/
        );
    });

    // ── COORD-4: In-Memory TTL Cache and Explicit Cache Invalidation ──
    it('COORD-4: Repeated reads use in-memory cache; clearCache forces fresh DB query', async () => {
        let dbQueryCount = 0;
        const origFind = SystemSetting.findOne;
        SystemSetting.findOne = (q) => {
            dbQueryCount++;
            return origFind(q);
        };

        mockSystemSettings.set(COORDINATOR_KEY, {
            key: COORDINATOR_KEY,
            value: { owner: 'LEGACY', epoch: 1, drainBarrierMs: 10000 }
        });

        // 1. First read hits DB
        const r1 = await getExecutionOwner();
        assert.equal(r1.epoch, 1);
        assert.equal(dbQueryCount, 1);

        // 2. Second read within TTL hits cache (no new DB query)
        const r2 = await getExecutionOwner();
        assert.equal(r2.epoch, 1);
        assert.equal(dbQueryCount, 1);

        // 3. Clear cache -> next read hits DB
        clearCache();
        const r3 = await getExecutionOwner();
        assert.equal(r3.epoch, 1);
        assert.equal(dbQueryCount, 2);
    });

    // ── COORD-5: TRANSITIONING State Suppresses Both Legacy and Durable ──
    it('COORD-5: TRANSITIONING state suppresses both legacy fireEvent and durable worker', async () => {
        await updateExecutionOwner(EXECUTION_OWNERS.TRANSITIONING);

        const legacyAuth = await validateExecutionAuthority('LEGACY', 'deal_created');
        assert.equal(legacyAuth.authorized, false);
        assert.equal(legacyAuth.reason, 'COORDINATOR_TRANSITIONING');

        const durableAuth = await validateExecutionAuthority('DURABLE', 'deal_created');
        assert.equal(durableAuth.authorized, false);
        assert.equal(durableAuth.reason, 'COORDINATOR_TRANSITIONING');

        // Verify fireEvent does not execute actions during TRANSITIONING
        const dealId = 'deal-tr-5';
        mockTriggers.push({
            _id: 'trg-tr-5',
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: 'act-tr-5', type: 'update_field', field: 'status', value: 'Transitioning' }]
        });
        mockEntities.set(`Deal:${dealId}`, { _id: dealId, status: 'Open' });

        await WorkflowEngine.fireEvent('deals', 'deal_created', { _id: dealId, status: 'Open' });
        assert.equal(mockEntities.get(`Deal:${dealId}`).status, 'Open', 'Action must not execute during TRANSITIONING');
    });

    // ── COORD-6: DURABLE State Authorizes Durable Worker & Suppresses Legacy ──
    it('COORD-6: DURABLE state authorizes durable worker and suppresses legacy fireEvent', async () => {
        await updateExecutionOwner(EXECUTION_OWNERS.DURABLE);

        const legacyAuth = await validateExecutionAuthority('LEGACY', 'deal_created');
        assert.equal(legacyAuth.authorized, false);
        assert.equal(legacyAuth.reason, 'AUTHORITY_TRANSFERRED_TO_DURABLE');

        const durableAuth = await validateExecutionAuthority('DURABLE', 'deal_created');
        assert.equal(durableAuth.authorized, true);
        assert.equal(durableAuth.reason, 'AUTHORITATIVE_DURABLE');

        // Test fireEvent suppression
        const dealId = 'deal-dur-6';
        mockTriggers.push({
            _id: 'trg-dur-6',
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: 'act-dur-6', type: 'update_field', field: 'status', value: 'UpdatedByLegacy' }]
        });
        mockEntities.set(`Deal:${dealId}`, { _id: dealId, status: 'Open' });

        await WorkflowEngine.fireEvent('deals', 'deal_created', { _id: dealId, status: 'Open' });
        assert.equal(mockEntities.get(`Deal:${dealId}`).status, 'Open', 'Legacy must be suppressed when owner is DURABLE');

        // Test durable worker execution
        const job = createJob('job-dur-6', 'DealCreated', 'Deal', dealId);
        const result = await processDomainEvent(job, {
            TEST_MODE_REAL_EXECUTION_OVERRIDE: true,
            COORDINATOR_OWNER_OVERRIDE: 'DURABLE'
        });
        assert.equal(result.executionResults[0].decision, 'EXECUTED');
        assert.equal(mockEntities.get(`Deal:${dealId}`).status, 'UpdatedByLegacy');
    });

    // ── COORD-7: Non-DealCreated Events Bypass Coordinator ──
    it('COORD-7: Non-DealCreated events (leads, activities, campaigns) always authorized', async () => {
        await updateExecutionOwner(EXECUTION_OWNERS.DISABLED);

        // deal_created is disabled
        const dealAuth = await validateExecutionAuthority('LEGACY', 'deal_created');
        assert.equal(dealAuth.authorized, false);

        // lead_created is unaffected
        const leadAuth = await validateExecutionAuthority('LEGACY', 'lead_created');
        assert.equal(leadAuth.authorized, true);
        assert.equal(leadAuth.reason, 'NON_COORDINATED_EVENT');

        // activity_created is unaffected
        const actAuth = await validateExecutionAuthority('LEGACY', 'activity_created');
        assert.equal(actAuth.authorized, true);
        assert.equal(actAuth.reason, 'NON_COORDINATED_EVENT');
    });

    // ── COORD-8: Dynamic Drain Barrier Calculation ──
    it('COORD-8: getPendingClaimsCount counts active pending leases and ignores expired ones', async () => {
        const now = Date.now();

        // 1. Active pending claim (valid for 60s more)
        mockAutomationLogs.set('canonical-deal_created-d1-t1-a1', {
            idempotencyKey: 'canonical-deal_created-d1-t1-a1',
            status: 'pending',
            leaseUntil: new Date(now + 60000)
        });

        // 2. Expired pending claim (expired 10s ago)
        mockAutomationLogs.set('canonical-deal_created-d2-t1-a1', {
            idempotencyKey: 'canonical-deal_created-d2-t1-a1',
            status: 'pending',
            leaseUntil: new Date(now - 10000)
        });

        // 3. Completed claim (success)
        mockAutomationLogs.set('canonical-deal_created-d3-t1-a1', {
            idempotencyKey: 'canonical-deal_created-d3-t1-a1',
            status: 'success',
            leaseUntil: new Date(now + 60000)
        });

        const drainStatus = await getPendingClaimsCount();
        assert.equal(drainStatus.activePendingCount, 1, 'Only active pending leases must be counted');
    });

    // ── COORD-9: Pre-Dispatch Fencing Check Rejects Expired Lease ──
    it('COORD-9: WorkflowEngine.executeAction aborts before WhatsApp dispatch if lease expired', async () => {
        const WhatsAppService = (await import('../services/WhatsAppService.js')).default;
        const origGetTemplates = WhatsAppService.getTemplates;
        const origSendTemplate = WhatsAppService.sendTemplate;
        let externalDispatchCalled = false;

        WhatsAppService.getTemplates = async () => [
            { name: 'welcome_template', language: 'en', components: [] }
        ];
        WhatsAppService.sendTemplate = async () => {
            externalDispatchCalled = true;
            return { success: true };
        };

        const trigger = {
            _id: 'trg-fence-9',
            module: 'deals',
            event: 'deal_created'
        };
        const action = {
            _id: 'act-fence-9',
            type: 'send_communication',
            channel: 'whatsapp',
            templateId: 'welcome_template'
        };
        const entityData = {
            _id: 'deal-fence-9',
            mobile: '9876543210'
        };

        // Caller managed claim with expired lease (expired 5s ago)
        const executionOptions = {
            callerManagedClaim: true,
            canonicalClaimAcquired: true,
            idempotencyKey: 'canonical-deal_created-deal-fence-9-trg-fence-9-act-fence-9',
            claimToken: 'tok-fence-9',
            leaseUntil: new Date(Date.now() - 5000), // EXPIRED
            rethrowErrors: true
        };

        try {
            await assert.rejects(
                async () => {
                    await WorkflowEngine.executeAction(action, entityData, trigger, null, false, executionOptions);
                },
                /Lease expired prior to external WhatsApp template dispatch/
            );
            assert.equal(externalDispatchCalled, false, 'External WhatsApp dispatch MUST NOT be called when lease expired');
        } finally {
            WhatsAppService.getTemplates = origGetTemplates;
            WhatsAppService.sendTemplate = origSendTemplate;
        }
    });

    // ── COORD-10: Operator Rollback Protocol (DURABLE -> LEGACY) ──
    it('COORD-10: Rollback to LEGACY immediately restores legacy authority and suppresses durable worker', async () => {
        // Step 1: In DURABLE mode (Epoch 1)
        await updateExecutionOwner(EXECUTION_OWNERS.DURABLE, { reason: 'Initial promotion' });
        assert.equal((await getExecutionOwner()).owner, 'DURABLE');

        // Step 2: Emergency Rollback to LEGACY (Epoch 2)
        const rollback = await updateExecutionOwner(EXECUTION_OWNERS.LEGACY, {
            reason: 'Emergency rollback triggered by operator'
        });
        assert.equal(rollback.owner, 'LEGACY');
        assert.equal(rollback.epoch, 2);

        // Verify durable worker suppresses execution after rollback
        const dealId = 'deal-rb-10';
        mockTriggers.push({
            _id: 'trg-rb-10',
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: 'act-rb-10', type: 'update_field', field: 'status', value: 'RolledBack' }]
        });
        mockEntities.set(`Deal:${dealId}`, { _id: dealId, status: 'Original' });

        const job = createJob('job-rb-10', 'DealCreated', 'Deal', dealId);
        const result = await processDomainEvent(job, {
            TEST_MODE_REAL_EXECUTION_OVERRIDE: true,
            COORDINATOR_OWNER_OVERRIDE: 'LEGACY'
        });
        assert.equal(result.executionResults[0].decision, 'SUPPRESSED_COORDINATOR');
        assert.equal(mockEntities.get(`Deal:${dealId}`).status, 'Original');

        // Verify legacy path now executes
        await WorkflowEngine.fireEvent('deals', 'deal_created', { _id: dealId, status: 'Original' });
        assert.equal(mockEntities.get(`Deal:${dealId}`).status, 'RolledBack');
    });

    // ── COORD-11: Two-Tier Defense-in-Depth under Multi-Instance Skew ──
    it('COORD-11: Multi-instance view skew is safely fenced by Tier 2 canonical claim', async () => {
        const dealId = 'deal-skew-11';
        const triggerId = 'trg-skew-11';
        const actionId = 'act-skew-11';

        mockTriggers.push({
            _id: triggerId,
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: actionId, type: 'update_field', field: 'executionPath', value: 'LEGACY' }]
        });
        mockEntities.set(`Deal:${dealId}`, { _id: dealId, executionPath: 'NONE' });

        // Node 1 (LEGACY) executes first and acquires canonical claim
        await WorkflowEngine.fireEvent('deals', 'deal_created', { _id: dealId, executionPath: 'NONE' });
        assert.equal(mockEntities.get(`Deal:${dealId}`).executionPath, 'LEGACY');

        // Node 2 (DURABLE due to view skew) attempts to execute the same deal
        const job = createJob('job-skew-11', 'DealCreated', 'Deal', dealId);
        const durableResult = await processDomainEvent(job, {
            TEST_MODE_REAL_EXECUTION_OVERRIDE: true,
            COORDINATOR_OWNER_OVERRIDE: 'DURABLE'
        });

        // Node 2 is blocked by Tier 2 canonical claim!
        assert.equal(durableResult.executionResults[0].decision, 'SKIPPED_DUPLICATE');
        assert.equal(durableResult.executionResults[0].reason, 'Already processed (status: success)');
        assert.equal(mockEntities.get(`Deal:${dealId}`).executionPath, 'LEGACY');
    });

    // ── COORD-12: DISABLED State Suppresses All Execution ──
    it('COORD-12: DISABLED state suppresses both legacy and durable paths', async () => {
        await updateExecutionOwner(EXECUTION_OWNERS.DISABLED);

        const legAuth = await validateExecutionAuthority('LEGACY', 'deal_created');
        assert.equal(legAuth.authorized, false);
        assert.equal(legAuth.reason, 'COORDINATOR_DISABLED');

        const durAuth = await validateExecutionAuthority('DURABLE', 'deal_created');
        assert.equal(durAuth.authorized, false);
        assert.equal(durAuth.reason, 'COORDINATOR_DISABLED');
    });
});
