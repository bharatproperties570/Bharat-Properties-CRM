/**
 * Phase 4 — Multi-Tenancy & Data-Scope Security Isolation Test Suite
 *
 * Verifies:
 * 1. getVisibilityFilter strict tenant isolation across all scopes (assigned, team, everyone, all).
 * 2. Unsafe fallback elimination: dataScope: 'all' without platform superadmin is strictly tenant-scoped.
 * 3. Deny-by-default behavior for unauthenticated, invalid, or missing tenant identities.
 * 4. Cross-tenant isolation in resolveContactIdentity (no cross-tenant contact matching/merging).
 * 5. Multi-tenant tagging and propagation in LeadCreationEngine and DealCreationEngine.
 * 6. OutboxEvent multi-tenant tagging and provenance propagation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { getVisibilityFilter } from '../utils/visibility.js';
import { resolveContactIdentity } from '../services/contactIdentity.service.js';
import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import OutboxEvent from '../models/OutboxEvent.js';
import Lookup from '../models/Lookup.js';
import SystemSetting from '../models/SystemSetting.js';
import { createStandardizedLead } from '../services/LeadCreationEngine.js';
import { createStandardizedDeal } from '../services/DealCreationEngine.js';

describe('Phase 4 — Multi-Tenancy & Data-Scope Isolation Tests', () => {

    const tenantA = new mongoose.Types.ObjectId('64000000000000000000000a');
    const tenantB = new mongoose.Types.ObjectId('64000000000000000000000b');
    const userA_Id = new mongoose.Types.ObjectId('64000000000000000000001a');
    const userB_Id = new mongoose.Types.ObjectId('64000000000000000000001b');
    const teamA_Id = new mongoose.Types.ObjectId('64000000000000000000002a');

    // ─────────────────────────────────────────────────────────────
    // 1. VISIBILITY ENGINE TENANCY ISOLATION
    // ─────────────────────────────────────────────────────────────
    describe('1. Visibility Engine Multi-Tenant Data Scoping', () => {

        it('VIS-01: Deny by default for missing or invalid user context', async () => {
            const nullFilter = await getVisibilityFilter(null);
            assert.deepStrictEqual(nullFilter, { _id: null });

            const emptyUserFilter = await getVisibilityFilter({});
            assert.deepStrictEqual(emptyUserFilter, { _id: null });

            const invalidIdFilter = await getVisibilityFilter({ _id: 'not-an-id' });
            assert.deepStrictEqual(invalidIdFilter, { _id: null });
        });

        it('VIS-02: Tenant A user with dataScope: "assigned" is strictly constrained to Tenant A', async () => {
            const userA = {
                _id: userA_Id,
                email: 'agentA@tenantA.com',
                tenantId: tenantA,
                dataScope: 'assigned',
                teams: [teamA_Id]
            };

            const filter = await getVisibilityFilter(userA);
            assert(filter.$and, 'Filter must contain $and root condition');
            
            // First condition MUST be { tenantId: userTenantId }
            const tenantClause = filter.$and.find(c => c.tenantId && c.tenantId.equals(tenantA));
            assert(tenantClause, 'Filter must strictly constrain to Tenant A');
            assert.strictEqual(tenantClause.tenantId.toString(), tenantA.toString());
        });

        it('VIS-03: Tenant A user with dataScope: "team" is strictly constrained to Tenant A', async () => {
            const userA = {
                _id: userA_Id,
                email: 'agentA@tenantA.com',
                tenantId: tenantA,
                dataScope: 'team',
                teams: [teamA_Id]
            };

            const filter = await getVisibilityFilter(userA);
            assert(filter.$and, 'Filter must contain $and root condition');
            const tenantClause = filter.$and.find(c => c.tenantId && c.tenantId.equals(tenantA));
            assert(tenantClause, 'Filter must strictly constrain to Tenant A');
        });

        it('VIS-04: Tenant A user with dataScope: "all" is locked to Tenant A (NO cross-tenant dataScope all leak)', async () => {
            const tenantAdminA = {
                _id: userA_Id,
                email: 'admin@tenantA.com',
                tenantId: tenantA,
                dataScope: 'all',
                role: { name: 'Admin' }
            };

            const filter = await getVisibilityFilter(tenantAdminA);
            // Must NEVER be {} (unrestricted global)
            assert.notDeepStrictEqual(filter, {});
            assert.deepStrictEqual(filter, { tenantId: tenantA });
        });

        it('VIS-05: Tenant B user with dataScope: "all" is locked to Tenant B', async () => {
            const tenantAdminB = {
                _id: userB_Id,
                email: 'admin@tenantB.com',
                tenantId: tenantB,
                dataScope: 'all',
                role: { name: 'Admin' }
            };

            const filter = await getVisibilityFilter(tenantAdminB);
            assert.notDeepStrictEqual(filter, {});
            assert.deepStrictEqual(filter, { tenantId: tenantB });
            assert.notDeepStrictEqual(filter, { tenantId: tenantA });
        });

        it('VIS-06: Non-tenant user with unverified dataScope: "all" falls back to assigned, not global {}', async () => {
            const rogueUser = {
                _id: userA_Id,
                email: 'hacker@random.com',
                dataScope: 'all', // Unverified!
                role: { name: 'Agent' }
            };

            const filter = await getVisibilityFilter(rogueUser);
            // Must NOT be {}
            assert.notDeepStrictEqual(filter, {});
            // Must contain private/assigned rules
            assert(filter.$or, 'Must fall back to assigned/team/everyone rules without global bypass');
        });

        it('VIS-07: Platform Super Admin without tenant has audited system owner bypass', async () => {
            const platformOwner = {
                _id: userA_Id,
                email: 'bharatproperties570@gmail.com',
                role: { name: 'Super Admin' },
                dataScope: 'all'
                // No tenantId -> platform owner
            };

            const filter = await getVisibilityFilter(platformOwner);
            assert.deepStrictEqual(filter, {});
        });

        it('VIS-08: Platform Super Admin WITH tenant assignment is restricted to that tenant', async () => {
            const platformOwnerInTenant = {
                _id: userA_Id,
                email: 'bharatproperties570@gmail.com',
                role: { name: 'Super Admin' },
                tenantId: tenantA,
                dataScope: 'all'
            };

            const filter = await getVisibilityFilter(platformOwnerInTenant);
            // Tenant assignment takes precedence over super admin bypass to prevent accidental cross-tenant contamination
            assert.deepStrictEqual(filter, { tenantId: tenantA });
        });

        it('VIS-09: "Everyone" / "Public" records in Tenant A cannot be seen by Tenant B', async () => {
            const userB = {
                _id: userB_Id,
                email: 'agentB@tenantB.com',
                tenantId: tenantB,
                dataScope: 'assigned'
            };

            const filterB = await getVisibilityFilter(userB);
            
            // Simulated record from Tenant A marked visibleTo: 'Everyone'
            const recordTenantA = {
                _id: new mongoose.Types.ObjectId(),
                tenantId: tenantA,
                visibleTo: 'Everyone',
                assignedTo: new mongoose.Types.ObjectId()
            };

            // In MongoDB, a query with filterB must NOT match recordTenantA because recordTenantA.tenantId !== tenantB
            const tenantMatch = recordTenantA.tenantId.equals(filterB.$and[0].tenantId);
            assert.strictEqual(tenantMatch, false, 'Tenant A Public record must NOT match Tenant B filter');
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. CONTACT IDENTITY RESOLUTION ISOLATION
    // ─────────────────────────────────────────────────────────────
    describe('2. Contact Identity Resolution Multi-Tenant Isolation', () => {

        it('CID-01: resolveContactIdentity queries strictly within effective tenantId', async () => {
            let queriedFilter = null;
            const originalFindOne = Contact.findOne;

            Contact.findOne = (query) => {
                queriedFilter = query;
                return {
                    session: () => Promise.resolve(null)
                };
            };

            try {
                await resolveContactIdentity({
                    mobile: '9876543210',
                    tenantId: tenantA,
                    createIfMissing: false
                });

                assert(queriedFilter, 'Contact.findOne must be called');
                assert(queriedFilter.tenantId, 'Query must enforce tenantId filter');
                assert.strictEqual(queriedFilter.tenantId.toString(), tenantA.toString());
            } finally {
                Contact.findOne = originalFindOne;
            }
        });

        it('CID-02: Contacts with identical phones in different tenants are completely segregated', async () => {
            const mockContactTenantA = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Contact in Tenant A',
                tenantId: tenantA,
                phones: [{ number: '+919876543210' }]
            };

            const originalFindOne = Contact.findOne;
            Contact.findOne = (query) => {
                // If query is for tenantB, tenantA's contact is NEVER returned
                if (query.tenantId && query.tenantId.equals(tenantA)) {
                    return { session: () => Promise.resolve(mockContactTenantA) };
                }
                return { session: () => Promise.resolve(null) };
            };

            try {
                // Querying for Tenant A finds Contact A
                const resA = await resolveContactIdentity({
                    mobile: '9876543210',
                    tenantId: tenantA
                });
                assert.strictEqual(resA.success, true);
                assert.strictEqual(resA.contact._id.toString(), mockContactTenantA._id.toString());

                // Querying for Tenant B does NOT find Contact A
                const resB = await resolveContactIdentity({
                    mobile: '9876543210',
                    tenantId: tenantB
                });
                assert.strictEqual(resB.success, true);
                assert.strictEqual(resB.contact, null);
            } finally {
                Contact.findOne = originalFindOne;
            }
        });

        it('CID-03: Creating a missing contact stamps effective tenantId', async () => {
            let upsertFilter = null;
            let upsertUpdate = null;
            const originalFindOneAndUpdate = Contact.findOneAndUpdate;
            const originalFindOne = Contact.findOne;

            Contact.findOne = () => ({ session: () => Promise.resolve(null) });
            Contact.findOneAndUpdate = (filter, update) => {
                upsertFilter = filter;
                upsertUpdate = update;
                return {
                    session: () => Promise.resolve({
                        _id: new mongoose.Types.ObjectId(),
                        name: 'New Tenant Contact',
                        tenantId: tenantA
                    })
                };
            };

            try {
                const res = await resolveContactIdentity({
                    mobile: '9876543210',
                    tenantId: tenantA,
                    createIfMissing: true,
                    contactData: { name: 'New Tenant Contact' }
                });

                assert.strictEqual(res.success, true);
                assert(upsertFilter.tenantId, 'Upsert filter must contain tenantId');
                assert.strictEqual(upsertFilter.tenantId.toString(), tenantA.toString());
                assert.strictEqual(upsertUpdate.$setOnInsert.tenantId.toString(), tenantA.toString());
            } finally {
                Contact.findOne = originalFindOne;
                Contact.findOneAndUpdate = originalFindOneAndUpdate;
            }
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. LEAD CREATION ENGINE TENANT TAGGING & OUTBOX
    // ─────────────────────────────────────────────────────────────
    describe('3. Lead Creation Engine Multi-Tenancy & Outbox Tagging', () => {

        it('LCE-01: Standardized lead creation sets tenantId and OutboxEvent tenantId', async () => {
            let createdLeadDoc = null;
            let createdOutboxEntries = null;

            const originalSave = Lead.prototype.save;
            const originalFindById = Lead.findById;
            const originalOutboxCreate = OutboxEvent.create;
            const originalFindOneContact = Contact.findOne;
            const originalFindOneAndUpdateContact = Contact.findOneAndUpdate;
            const originalLookupFindOne = Lookup.findOne;
            const originalLookupCreate = Lookup.create;

            Contact.findOne = () => ({ session: () => Promise.resolve(null) });
            Contact.findOneAndUpdate = () => ({
                session: () => Promise.resolve({
                    _id: new mongoose.Types.ObjectId(),
                    name: 'New Tenant Contact',
                    tenantId: tenantA
                })
            });
            const mockLookupDoc = { _id: new mongoose.Types.ObjectId() };
            Lookup.findOne = () => ({
                session: () => Promise.resolve(mockLookupDoc),
                lean: () => Promise.resolve(mockLookupDoc),
                exec: () => Promise.resolve(mockLookupDoc),
                then: (resolve) => resolve(mockLookupDoc)
            });
            Lookup.create = async () => mockLookupDoc;

            Lead.prototype.save = function() {
                createdLeadDoc = this;
                this._id = new mongoose.Types.ObjectId();
                return Promise.resolve(this);
            };

            Lead.findById = (id) => Promise.resolve(createdLeadDoc);

            OutboxEvent.create = (entries) => {
                createdOutboxEntries = entries;
                return Promise.resolve(entries);
            };

            // Mock session to avoid needing real replica set for unit test
            const mockSession = {
                withTransaction: async (fn) => fn(),
                endSession: () => {},
                inTransaction: () => true,
                abortTransaction: async () => {}
            };

            try {
                await createStandardizedLead(
                    {
                        fullName: 'John Tenant Doe',
                        mobile: '9988776655',
                        tenantId: tenantA
                    },
                    {
                        session: mockSession,
                        actorId: userA_Id,
                        actorType: 'HUMAN',
                        source: 'API'
                    }
                );

                assert(createdLeadDoc, 'Lead must be saved');
                assert.strictEqual(createdLeadDoc.tenantId.toString(), tenantA.toString());

                assert(createdOutboxEntries && createdOutboxEntries.length > 0, 'OutboxEvent must be created');
                const outbox = createdOutboxEntries[0];
                assert.strictEqual(outbox.tenantId.toString(), tenantA.toString());
                assert.strictEqual(outbox.eventType, 'LeadCreated');
                assert.strictEqual(outbox.provenance.actorId.toString(), userA_Id.toString());
                assert.strictEqual(outbox.provenance.source, 'API');
            } finally {
                Lead.prototype.save = originalSave;
                Lead.findById = originalFindById;
                OutboxEvent.create = originalOutboxCreate;
                Contact.findOne = originalFindOneContact;
                Contact.findOneAndUpdate = originalFindOneAndUpdateContact;
                Lookup.findOne = originalLookupFindOne;
                Lookup.create = originalLookupCreate;
            }
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 4. DEAL CREATION ENGINE TENANT TAGGING & OUTBOX
    // ─────────────────────────────────────────────────────────────
    describe('4. Deal Creation Engine Multi-Tenancy & Outbox Tagging', () => {

        it('DCE-01: Standardized deal creation stamps tenantId on Deal and OutboxEvent', async () => {
            let createdDealDocs = null;
            let createdOutboxEntries = null;

            const originalDealCreate = Deal.create;
            const originalDealFindByIdAndUpdate = Deal.findByIdAndUpdate;
            const originalOutboxCreate = OutboxEvent.create;
            const originalSystemSettingFindOne = SystemSetting.findOne;

            SystemSetting.findOne = () => ({
                session: () => ({
                    lean: () => Promise.resolve(null)
                }),
                lean: () => Promise.resolve(null),
                exec: () => Promise.resolve(null)
            });

            Deal.create = (docs) => {
                createdDealDocs = docs;
                docs[0]._id = new mongoose.Types.ObjectId();
                return Promise.resolve(docs);
            };

            Deal.findByIdAndUpdate = () => Promise.resolve({});

            OutboxEvent.create = (entries) => {
                createdOutboxEntries = entries;
                return Promise.resolve(entries);
            };

            const mockSession = {
                startTransaction: () => {},
                commitTransaction: async () => {},
                abortTransaction: async () => {},
                endSession: () => {},
                inTransaction: () => false
            };

            try {
                const res = await createStandardizedDeal(
                    {
                        source: 'API',
                        tenantId: tenantA,
                        dealData: {
                            projectName: 'Tenant Tower A',
                            dealValue: 15000000,
                            tenantId: tenantA
                        }
                    },
                    { session: mockSession }
                );

                assert(createdDealDocs && createdDealDocs.length > 0, 'Deal must be created');
                assert.strictEqual(createdDealDocs[0].tenantId.toString(), tenantA.toString());

                assert(createdOutboxEntries && createdOutboxEntries.length > 0, 'OutboxEvent must be created');
                const outbox = createdOutboxEntries[0];
                assert.strictEqual(outbox.tenantId.toString(), tenantA.toString());
                assert.strictEqual(outbox.eventType, 'DealCreated');
            } finally {
                Deal.create = originalDealCreate;
                Deal.findByIdAndUpdate = originalDealFindByIdAndUpdate;
                OutboxEvent.create = originalOutboxCreate;
                SystemSetting.findOne = originalSystemSettingFindOne;
            }
        });
    });
});
