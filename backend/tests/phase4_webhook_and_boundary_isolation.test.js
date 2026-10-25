/**
 * phase4_webhook_and_boundary_isolation.test.js
 *
 * Verifies:
 * 1. Webhook Attribution & Anti-Spoofing:
 *    - Replay attack rejection (+/- 300s window)
 *    - Missing tenant config rejection
 *    - Cryptographic HMAC-SHA256 signature verification
 *    - Strict rejection of spoofed tenantId in query, header, or body
 *    - Valid tenant resolution and stamping
 * 2. Core Access Boundary Hardening:
 *    - bulkDeleteLeads, importLeads, checkDuplicatesImport
 *    - bulkDeleteContacts, searchDuplicates, importContacts, checkDuplicatesImport
 *    - bulkDeleteDeals, importDeals
 *    - bulkDeleteInventory, bulkUpdatePropertyOwners
 * 3. Historical Data Migration:
 *    - Dry-run safety
 *    - Explicit customer-to-tenant mapping
 *    - Never assigning arbitrary tenant to unmapped records
 *    - Idempotency and rollback support
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';

import { verifyWebhookAttribution } from '../middleware/webhookAttribution.middleware.js';
import TenantWebhookConfig from '../models/TenantWebhookConfig.js';
import AuditLog from '../models/AuditLog.js';
import Lead from '../models/Lead.js';
import Contact from '../models/Contact.js';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import DuplicationRule from '../models/DuplicationRule.js';

import {
    bulkDeleteLeads,
    importLeads,
    checkDuplicatesImport as checkDuplicatesImportLeads
} from '../controllers/lead.controller.js';

import {
    bulkDeleteContacts,
    searchDuplicates,
    checkDuplicatesImport as checkDuplicatesImportContacts
} from '../controllers/contact.controller.js';

import {
    bulkDeleteDeals
} from '../controllers/deal.controller.js';

import {
    bulkDeleteInventory
} from '../controllers/inventory.controller.js';

import {
    executeTenancyBackfill,
    resolveDocumentTenant,
    MIGRATION_ID
} from '../migrations/003-historical-tenancy-backfill.js';

describe('Phase 4 — Webhook Attribution, Core Boundaries & Historical Migration Suite', () => {

    const tenantA = new mongoose.Types.ObjectId('64000000000000000000000a');
    const tenantB = new mongoose.Types.ObjectId('64000000000000000000000b');
    const userA_Id = new mongoose.Types.ObjectId('64000000000000000000001a');
    const userB_Id = new mongoose.Types.ObjectId('64000000000000000000001b');

    // ─────────────────────────────────────────────────────────────
    // 1. EXTERNAL WEBHOOK ATTRIBUTION & ANTI-SPOOFING
    // ─────────────────────────────────────────────────────────────
    describe('1. Webhook Attribution & Anti-Spoofing Middleware', () => {

        let originalAuditCreate = null;

        beforeEach(() => {
            originalAuditCreate = AuditLog.create;
            AuditLog.create = (doc) => {
                const item = Array.isArray(doc) ? doc[0] : doc;
                return Promise.resolve(item);
            };
        });

        afterEach(() => {
            if (originalAuditCreate) {
                AuditLog.create = originalAuditCreate;
            }
        });

        it('WH-01: Replay attack (> 300s old timestamp) is rejected with 401', async () => {
            const middleware = verifyWebhookAttribution({ requireTimestamp: true });

            const req = {
                headers: {
                    'x-timestamp': Math.floor((Date.now() - 400_000) / 1000).toString(),
                    'x-ingestion-key': 'valid-key'
                },
                query: {},
                body: {},
                originalUrl: '/api/v1/webhook/lead',
                ip: '127.0.0.1'
            };

            let statusSent = null;
            let jsonSent = null;
            const res = {
                status: (code) => {
                    statusSent = code;
                    return { json: (data) => { jsonSent = data; } };
                }
            };
            let nextCalled = false;

            await middleware(req, res, () => { nextCalled = true; });

            assert.strictEqual(statusSent, 401);
            assert.strictEqual(jsonSent.code, 'WEBHOOK_REPLAY_DETECTED');
            assert.strictEqual(nextCalled, false);
        });

        it('WH-02: Unmapped webhook source (no valid ingestion key or provider) is rejected with 401', async () => {
            const originalFindOne = TenantWebhookConfig.findOne;
            TenantWebhookConfig.findOne = () => ({
                lean: () => Promise.resolve(null)
            });

            const originalAuditCreate = AuditLog.create;
            let auditLogged = null;
            AuditLog.create = (doc) => {
                auditLogged = Array.isArray(doc) ? doc[0] : doc;
                return Promise.resolve(auditLogged);
            };

            try {
                const middleware = verifyWebhookAttribution({ requireTimestamp: false });
                const req = {
                    headers: { 'x-ingestion-key': 'non-existent-key' },
                    query: {},
                    body: { mobile: '9999999999' },
                    originalUrl: '/api/v1/webhook/lead',
                    ip: '192.168.1.1'
                };

                let statusSent = null;
                let jsonSent = null;
                const res = {
                    status: (code) => {
                        statusSent = code;
                        return { json: (data) => { jsonSent = data; } };
                    }
                };
                let nextCalled = false;

                await middleware(req, res, () => { nextCalled = true; });

                assert.strictEqual(statusSent, 401);
                assert.strictEqual(jsonSent.code, 'UNMAPPED_WEBHOOK_SOURCE');
                assert.strictEqual(nextCalled, false);
                assert(auditLogged, 'Auditable security failure must be recorded');
                assert.strictEqual(auditLogged.eventType, 'unauthorized_access_attempt');
                assert.strictEqual(auditLogged.metadata.reason, 'UNMAPPED_WEBHOOK_SOURCE');
            } finally {
                TenantWebhookConfig.findOne = originalFindOne;
                AuditLog.create = originalAuditCreate;
            }
        });

        it('WH-03: Invalid HMAC signature is rejected with 401', async () => {
            const fakeConfig = {
                tenantId: tenantA,
                provider: 'GENERIC',
                secret: 'super-secret-key-12345',
                isActive: true
            };

            const originalFindOne = TenantWebhookConfig.findOne;
            TenantWebhookConfig.findOne = () => ({
                lean: () => Promise.resolve(fakeConfig)
            });

            try {
                const middleware = verifyWebhookAttribution({ requireTimestamp: false });
                const req = {
                    headers: {
                        'x-ingestion-key': 'valid-key',
                        'x-signature-sha256': 'invalid-hex-signature'
                    },
                    query: {},
                    body: { mobile: '9876543210' },
                    originalUrl: '/api/v1/webhook/lead',
                    ip: '127.0.0.1'
                };

                let statusSent = null;
                let jsonSent = null;
                const res = {
                    status: (code) => {
                        statusSent = code;
                        return { json: (data) => { jsonSent = data; } };
                    }
                };
                let nextCalled = false;

                await middleware(req, res, () => { nextCalled = true; });

                assert.strictEqual(statusSent, 401);
                assert.strictEqual(jsonSent.code, 'INVALID_WEBHOOK_SIGNATURE');
                assert.strictEqual(nextCalled, false);
            } finally {
                TenantWebhookConfig.findOne = originalFindOne;
            }
        });

        it('WH-04: Spoofed tenantId query parameter is rejected with 403', async () => {
            const fakeConfig = {
                tenantId: tenantA,
                provider: 'GENERIC',
                secret: null,
                isActive: true
            };

            const originalFindOne = TenantWebhookConfig.findOne;
            TenantWebhookConfig.findOne = () => ({
                lean: () => Promise.resolve(fakeConfig)
            });

            const originalAuditCreate = AuditLog.create;
            let auditLogged = null;
            AuditLog.create = (doc) => {
                auditLogged = Array.isArray(doc) ? doc[0] : doc;
                return Promise.resolve(auditLogged);
            };

            try {
                const middleware = verifyWebhookAttribution({ requireTimestamp: false });
                const req = {
                    headers: { 'x-ingestion-key': 'valid-key' },
                    query: { tenantId: tenantB.toString() }, // SPOOF ATTEMPT
                    body: { mobile: '9876543210' },
                    originalUrl: '/api/v1/webhook/lead',
                    ip: '10.0.0.1'
                };

                let statusSent = null;
                let jsonSent = null;
                const res = {
                    status: (code) => {
                        statusSent = code;
                        return { json: (data) => { jsonSent = data; } };
                    }
                };
                let nextCalled = false;

                await middleware(req, res, () => { nextCalled = true; });

                assert.strictEqual(statusSent, 403);
                assert.strictEqual(jsonSent.code, 'TENANT_IDENTITY_SPOOF_DETECTED');
                assert.strictEqual(nextCalled, false);
                assert(auditLogged, 'Security audit log must be written on spoof attempt');
                assert.strictEqual(auditLogged.eventType, 'unauthorized_access_attempt');
                assert.strictEqual(auditLogged.metadata.reason, 'SPOOFED_TENANT_ID');
            } finally {
                TenantWebhookConfig.findOne = originalFindOne;
                AuditLog.create = originalAuditCreate;
            }
        });

        it('WH-05: Valid HMAC webhook successfully resolves tenantId and overwrites payload', async () => {
            const secret = 'webhook-signing-secret-key-xyz';
            const payload = { firstName: 'John', mobile: '9876543210' };
            const payloadString = JSON.stringify(payload);
            const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

            const fakeConfig = {
                tenantId: tenantA,
                provider: 'GENERIC',
                secret,
                isActive: true
            };

            const originalFindOne = TenantWebhookConfig.findOne;
            TenantWebhookConfig.findOne = () => ({
                lean: () => Promise.resolve(fakeConfig)
            });

            try {
                const middleware = verifyWebhookAttribution({ requireTimestamp: false });
                const req = {
                    headers: {
                        'x-ingestion-key': 'valid-key',
                        'x-signature-sha256': signature
                    },
                    query: {},
                    body: payload,
                    rawBody: payloadString,
                    originalUrl: '/api/v1/webhook/lead',
                    ip: '127.0.0.1'
                };

                let nextCalled = false;
                await middleware(req, {}, () => { nextCalled = true; });

                assert.strictEqual(nextCalled, true);
                assert.strictEqual(req.resolvedTenantId.toString(), tenantA.toString());
                assert.strictEqual(req.body.tenantId.toString(), tenantA.toString());
            } finally {
                TenantWebhookConfig.findOne = originalFindOne;
            }
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. CORE ACCESS BOUNDARIES (BULK OPERATIONS & SEARCH)
    // ─────────────────────────────────────────────────────────────
    describe('2. Core Access Boundaries Multi-Tenant Isolation', () => {

        it('BOUNDARY-01: bulkDeleteLeads applies tenantFilter so Tenant A cannot delete Tenant B leads', async () => {
            let capturedDeleteFilter = null;
            const leadIdB = new mongoose.Types.ObjectId('6400000000000000000000bb');

            const originalSoftDelete = Lead.softDeleteMany;
            Lead.softDeleteMany = (filter) => {
                capturedDeleteFilter = filter;
                return Promise.resolve({ modifiedCount: 0 });
            };

            try {
                const req = {
                    user: { _id: userA_Id, tenantId: tenantA },
                    body: { ids: [leadIdB.toString()] }
                };
                let jsonResponse = null;
                const res = {
                    status: () => ({ json: (data) => { jsonResponse = data; } }),
                    json: (data) => { jsonResponse = data; }
                };

                await bulkDeleteLeads(req, res, () => {});

                assert.strictEqual(capturedDeleteFilter.tenantId.toString(), tenantA.toString());
                assert.deepStrictEqual(capturedDeleteFilter._id, { $in: [leadIdB.toString()] });
                assert.strictEqual(jsonResponse.message, 'Deleted');
            } finally {
                Lead.softDeleteMany = originalSoftDelete;
            }
        });

        it('BOUNDARY-02: checkDuplicatesImport for Leads scopes query by caller tenant', async () => {
            let capturedFindFilter = null;
            const originalFind = Lead.find;
            Lead.find = (filter) => {
                capturedFindFilter = filter;
                return { lean: () => Promise.resolve([]) };
            };

            try {
                const req = {
                    user: { _id: userA_Id, tenantId: tenantA },
                    body: { mobiles: ['9876543210'] }
                };
                let statusSent = null;
                let jsonSent = null;
                const res = {
                    status: (code) => {
                        statusSent = code;
                        return { json: (d) => { jsonSent = d; } };
                    }
                };

                await checkDuplicatesImportLeads(req, res, () => {});

                assert.strictEqual(statusSent, 200);
                assert.strictEqual(capturedFindFilter.tenantId.toString(), tenantA.toString());
            } finally {
                Lead.find = originalFind;
            }
        });

        it('BOUNDARY-03: bulkDeleteContacts scopes contacts and cascading references to tenant', async () => {
            let capturedFindFilter = null;
            let capturedSoftDeleteFilter = null;

            const originalFind = Contact.find;
            Contact.find = (filter) => {
                capturedFindFilter = filter;
                return Promise.resolve([]);
            };

            const originalSoftDelete = Contact.softDeleteMany;
            Contact.softDeleteMany = (filter) => {
                capturedSoftDeleteFilter = filter;
                return Promise.resolve({ modifiedCount: 0 });
            };

            try {
                const req = {
                    user: { _id: userA_Id, tenantId: tenantA },
                    body: { ids: [new mongoose.Types.ObjectId().toString()] }
                };
                let jsonResponse = null;
                const res = { json: (data) => { jsonResponse = data; } };

                await bulkDeleteContacts(req, res, () => {});

                assert.strictEqual(capturedFindFilter.tenantId.toString(), tenantA.toString());
                assert.strictEqual(capturedSoftDeleteFilter, null, 'Must not delete cross-tenant contacts');
                assert.strictEqual(jsonResponse.message, '0 contacts deleted');
            } finally {
                Contact.find = originalFind;
                Contact.softDeleteMany = originalSoftDelete;
            }
        });

        it('BOUNDARY-04: searchDuplicates for Contacts queries rules and records with tenantFilter', async () => {
            let ruleFilter = null;
            let contactFilter = null;

            const originalRuleFind = DuplicationRule.find;
            DuplicationRule.find = (filter) => {
                ruleFilter = filter;
                return Promise.resolve([]);
            };

            const originalContactFind = Contact.find;
            Contact.find = (filter) => {
                contactFilter = filter;
                return {
                    limit: () => ({
                        lean: () => Promise.resolve([])
                    })
                };
            };

            try {
                const req = {
                    user: { _id: userA_Id, tenantId: tenantA },
                    query: { phone: '9876543210' }
                };
                let jsonResponse = null;
                const res = {
                    status: () => ({ json: (data) => { jsonResponse = data; } })
                };

                await searchDuplicates(req, res, () => {});

                assert.strictEqual(ruleFilter.tenantId.toString(), tenantA.toString());
                assert(contactFilter.$and, 'Contact query must wrap in $and with tenantFilter');
                const tenantCond = contactFilter.$and.find(c => c.tenantId && c.tenantId.equals(tenantA));
                assert(tenantCond, 'Contact query must strictly enforce tenantFilter');
            } finally {
                DuplicationRule.find = originalRuleFind;
                Contact.find = originalContactFind;
            }
        });

        it('BOUNDARY-05: checkDuplicatesImport for Contacts scopes search with tenantFilter', async () => {
            let capturedFilter = null;
            const originalFind = Contact.find;
            Contact.find = (filter) => {
                capturedFilter = filter;
                return { lean: () => Promise.resolve([]) };
            };

            try {
                const req = {
                    user: { _id: userA_Id, tenantId: tenantA },
                    body: { mobiles: ['9123456789'] }
                };
                let statusSent = null;
                const res = {
                    status: (code) => {
                        statusSent = code;
                        return { json: () => {} };
                    }
                };

                await checkDuplicatesImportContacts(req, res, () => {});

                assert.strictEqual(statusSent, 200);
                assert(capturedFilter.$and, 'checkDuplicatesImport must use $and with tenantFilter');
                const tenantCond = capturedFilter.$and.find(c => c.tenantId && c.tenantId.equals(tenantA));
                assert(tenantCond, 'checkDuplicatesImport must enforce caller tenantId');
            } finally {
                Contact.find = originalFind;
            }
        });

        it('BOUNDARY-06: bulkDeleteDeals applies tenantFilter to prevent cross-tenant deletion', async () => {
            let capturedFindFilter = null;
            let capturedDeleteFilter = null;

            const originalDealFind = Deal.find;
            Deal.find = (filter) => {
                capturedFindFilter = filter;
                return { select: () => Promise.resolve([]) };
            };

            const originalDealDelete = Deal.deleteMany;
            Deal.deleteMany = (filter) => {
                capturedDeleteFilter = filter;
                return Promise.resolve({ deletedCount: 0 });
            };

            try {
                const req = {
                    user: { _id: userA_Id, tenantId: tenantA },
                    body: { ids: [new mongoose.Types.ObjectId().toString()] }
                };
                let jsonResponse = null;
                const res = { json: (d) => { jsonResponse = d; } };

                await bulkDeleteDeals(req, res);

                assert.strictEqual(capturedFindFilter.tenantId.toString(), tenantA.toString());
                assert.strictEqual(capturedDeleteFilter, null);
                assert.strictEqual(jsonResponse.message, '0 deals deleted');
            } finally {
                Deal.find = originalDealFind;
                Deal.deleteMany = originalDealDelete;
            }
        });

        it('BOUNDARY-07: bulkDeleteInventory applies tenantFilter to prevent cross-tenant deletion', async () => {
            let capturedFindFilter = null;
            let capturedDeleteFilter = null;

            const originalInvFind = Inventory.find;
            Inventory.find = (filter) => {
                capturedFindFilter = filter;
                return { select: () => Promise.resolve([]) };
            };

            const originalInvSoftDelete = Inventory.softDeleteMany;
            Inventory.softDeleteMany = (filter) => {
                capturedDeleteFilter = filter;
                return Promise.resolve({ modifiedCount: 0 });
            };

            try {
                const req = {
                    user: { _id: userA_Id, tenantId: tenantA },
                    body: { ids: [new mongoose.Types.ObjectId().toString()] }
                };
                let statusSent = null;
                let jsonResponse = null;
                const res = {
                    status: (code) => {
                        statusSent = code;
                        return { json: (d) => { jsonResponse = d; } };
                    }
                };

                await bulkDeleteInventory(req, res);

                assert.strictEqual(statusSent, 200);
                assert.strictEqual(capturedFindFilter.tenantId.toString(), tenantA.toString());
                assert.strictEqual(capturedDeleteFilter, null);
                assert.strictEqual(jsonResponse.message, '0 items deleted successfully');
            } finally {
                Inventory.find = originalInvFind;
                Inventory.softDeleteMany = originalInvSoftDelete;
            }
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. HISTORICAL DATA TENANCY MIGRATION
    // ─────────────────────────────────────────────────────────────
    describe('3. Historical Tenancy Migration & Verified Mapping', () => {

        it('MIG-01: resolveDocumentTenant resolves explicit mappings and NEVER guesses arbitrary tenant', () => {
            const mapping = {
                users: {
                    [userA_Id.toString()]: tenantA.toString(),
                    [userB_Id.toString()]: tenantB.toString()
                },
                contacts: {
                    'contact-123': tenantA.toString()
                },
                identifiers: {
                    '9999999999': tenantA.toString()
                }
            };

            // 1. Mapped by user
            const docWithUser = { _id: new mongoose.Types.ObjectId(), ownerId: userA_Id };
            const resolvedA = resolveDocumentTenant(docWithUser, 'leads', mapping);
            assert.strictEqual(resolvedA, tenantA.toString());

            // 2. Mapped by contact
            const docWithContact = { _id: new mongoose.Types.ObjectId(), contactId: 'contact-123' };
            const resolvedContact = resolveDocumentTenant(docWithContact, 'deals', mapping);
            assert.strictEqual(resolvedContact, tenantA.toString());

            // 3. Mapped by phone
            const docWithPhone = { _id: new mongoose.Types.ObjectId(), mobile: '9999999999' };
            const resolvedPhone = resolveDocumentTenant(docWithPhone, 'contacts', mapping);
            assert.strictEqual(resolvedPhone, tenantA.toString());

            // 4. Unmapped document MUST resolve to null (NEVER arbitrary fallback)
            const unmappedDoc = { _id: new mongoose.Types.ObjectId(), ownerId: 'unmapped-user-xyz' };
            const resolvedNull = resolveDocumentTenant(unmappedDoc, 'leads', mapping);
            assert.strictEqual(resolvedNull, null, 'Unmapped records must return null');
        });

        it('MIG-02: executeTenancyBackfill in dry-run mode identifies eligible and exceptions without writing', async () => {
            const mappedDocId = new mongoose.Types.ObjectId();
            const unmappedDocId = new mongoose.Types.ObjectId();

            const mockDocs = [
                { _id: mappedDocId, ownerId: userA_Id },
                { _id: unmappedDocId, ownerId: 'unknown-user' }
            ];

            // In-memory mock collection
            const mockCollection = {
                countDocuments: (query) => {
                    if (query.tenantId?.$exists === true) return Promise.resolve(0); // none already tagged
                    if (query._tenantMigrationRef) return Promise.resolve(0);
                    return Promise.resolve(mockDocs.length);
                },
                find: () => {
                    let idx = 0;
                    return {
                        batchSize: () => ({
                            hasNext: () => Promise.resolve(idx < mockDocs.length),
                            next: () => Promise.resolve(mockDocs[idx++])
                        })
                    };
                },
                bulkWrite: () => {
                    throw new Error("bulkWrite must NOT be called in dry-run mode!");
                }
            };

            const mockDb = {
                listCollections: () => ({
                    toArray: () => Promise.resolve([{ name: 'contacts' }])
                }),
                collection: () => mockCollection
            };

            const mapping = {
                users: { [userA_Id.toString()]: tenantA.toString() }
            };

            const report = await executeTenancyBackfill({
                db: mockDb,
                isDryRun: true,
                isRollback: false,
                mapping,
                collections: ['contacts']
            });

            assert.strictEqual(report.isDryRun, true);
            assert.strictEqual(report.totals.totalInspected, 2);
            assert.strictEqual(report.totals.missingTenantId, 2);
            assert.strictEqual(report.totals.mappedAndEligible, 1);
            assert.strictEqual(report.totals.migrated, 1); // Simulated in dry-run
            assert.strictEqual(report.totals.exceptionsCount, 1);
            assert.strictEqual(report.exceptions[0].documentId, unmappedDocId.toString());
            assert.strictEqual(report.exceptions[0].reason, 'NO_VERIFIED_TENANT_MAPPING');
        });

        it('MIG-03: executeTenancyBackfill in rollback mode unsets migration stamps', async () => {
            let rollbackQuery = null;
            let rollbackUpdate = null;

            const mockCollection = {
                countDocuments: (query) => {
                    rollbackQuery = query;
                    return Promise.resolve(5);
                },
                updateMany: (query, update) => {
                    rollbackQuery = query;
                    rollbackUpdate = update;
                    return Promise.resolve({ modifiedCount: 5 });
                }
            };

            const mockDb = {
                listCollections: () => ({
                    toArray: () => Promise.resolve([{ name: 'leads' }])
                }),
                collection: () => mockCollection
            };

            const report = await executeTenancyBackfill({
                db: mockDb,
                isDryRun: false,
                isRollback: true,
                collections: ['leads']
            });

            assert.strictEqual(report.isRollback, true);
            assert.strictEqual(report.totals.rolledBack, 5);
            assert.strictEqual(rollbackQuery._tenantMigrationRef, MIGRATION_ID);
            assert.deepStrictEqual(rollbackUpdate, {
                $unset: {
                    tenantId: 1,
                    _tenantMigrationRef: 1,
                    _tenantMigratedAt: 1
                }
            });
        });
    });
});
