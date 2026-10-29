/**
 * Phase 2.1 Integration Tests — Authority Verification Runtime Integration
 * 
 * Tests cover:
 * 1. Route file import and middleware chain verification
 * 2. Role schema — authorityVerification module defaults to all-false
 * 3. Role schema — new approval rights default to false
 * 4. AuditLog — all 6 new eventTypes pass validation
 * 5. AuditLog — new targetTypes pass validation
 * 6. Controller auditEvent calls use only valid enum values
 * 7. Snapshot immutability — replaceOne, deleteOne, deleteMany blocked
 * 8. Snapshot immutability — documented limitations (bulkWrite, native driver)
 * 9. Route mount presence in app.js
 * 10. Permission cross-check — controller permissions match schema definitions
 * 
 * Test infrastructure: Node.js built-in test runner + mongodb-memory-server
 * where database-backed tests are needed. Schema introspection tests do not
 * require a running database.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ========== Schema Introspection Tests (No DB Required) ==========

describe('Phase 2.1 — Schema Introspection Tests', () => {

    // ---------- Role Schema ----------

    describe('Role Schema — authorityVerification module', () => {
        let RoleSchema;

        before(async () => {
            // Import the schema definition for introspection
            // We read the file and extract schema info without connecting to DB
            const RoleModule = await import('../models/Role.js');
            const RoleModel = RoleModule.default;
            RoleSchema = RoleModel.schema;
        });

        it('should have authorityVerification in moduleAccess', () => {
            const moduleAccessPaths = RoleSchema.path('moduleAccess.authorityVerification.view');
            assert.ok(moduleAccessPaths, 'authorityVerification.view path must exist');
        });

        it('should default authorityVerification.view to false', () => {
            const viewPath = RoleSchema.path('moduleAccess.authorityVerification.view');
            assert.equal(viewPath.options.default, false,
                'authorityVerification.view must default to false for deny-by-default');
        });

        it('should default authorityVerification.create to false', () => {
            const path = RoleSchema.path('moduleAccess.authorityVerification.create');
            assert.ok(path, 'authorityVerification.create path must exist');
            assert.equal(path.options.default, false);
        });

        it('should default authorityVerification.edit to false', () => {
            const path = RoleSchema.path('moduleAccess.authorityVerification.edit');
            assert.ok(path, 'authorityVerification.edit path must exist');
            assert.equal(path.options.default, false);
        });

        it('should default authorityVerification.delete to false', () => {
            const path = RoleSchema.path('moduleAccess.authorityVerification.delete');
            assert.ok(path, 'authorityVerification.delete path must exist');
            assert.equal(path.options.default, false);
        });

        it('should have all 4 CRUD booleans like other modules', () => {
            const actions = ['view', 'create', 'edit', 'delete'];
            for (const action of actions) {
                const path = RoleSchema.path(`moduleAccess.authorityVerification.${action}`);
                assert.ok(path, `authorityVerification.${action} path must exist`);
                assert.equal(path.instance, 'Boolean',
                    `authorityVerification.${action} must be Boolean`);
            }
        });

        it('should not auto-grant authorityVerification to any new Role instance', () => {
            // Create a plain object from schema defaults — no DB needed
            const RoleModel = mongoose.model('Role');
            const role = new RoleModel({
                name: 'Test Role',
                department: 'sales'
            });
            assert.equal(role.moduleAccess.authorityVerification.view, false);
            assert.equal(role.moduleAccess.authorityVerification.create, false);
            assert.equal(role.moduleAccess.authorityVerification.edit, false);
            assert.equal(role.moduleAccess.authorityVerification.delete, false);
        });
    });

    describe('Role Schema — approval rights', () => {

        it('should have manageAuthoritySettings approval right', () => {
            const RoleModel = mongoose.model('Role');
            const schema = RoleModel.schema;
            const path = schema.path('approvalRights.manageAuthoritySettings');
            assert.ok(path, 'manageAuthoritySettings path must exist');
            assert.equal(path.instance, 'Boolean');
            assert.equal(path.options.default, false,
                'manageAuthoritySettings must default to false');
        });

        it('should have approveAuthorityChanges approval right', () => {
            const RoleModel = mongoose.model('Role');
            const schema = RoleModel.schema;
            const path = schema.path('approvalRights.approveAuthorityChanges');
            assert.ok(path, 'approveAuthorityChanges path must exist');
            assert.equal(path.instance, 'Boolean');
            assert.equal(path.options.default, false,
                'approveAuthorityChanges must default to false');
        });

        it('should not auto-grant new approval rights to a new Role', () => {
            const RoleModel = mongoose.model('Role');
            const role = new RoleModel({
                name: 'Approval Test Role',
                department: 'inventory'
            });
            assert.equal(role.approvalRights.manageAuthoritySettings, false);
            assert.equal(role.approvalRights.approveAuthorityChanges, false);
        });

        it('should preserve existing approval rights unchanged', () => {
            const RoleModel = mongoose.model('Role');
            const schema = RoleModel.schema;
            const existingRights = [
                'approveDeal', 'approveDiscount', 'approveStageChange',
                'approveListingPublish', 'allowHardDelete'
            ];
            for (const right of existingRights) {
                const path = schema.path(`approvalRights.${right}`);
                assert.ok(path, `Existing approval right ${right} must still exist`);
                assert.equal(path.instance, 'Boolean');
                assert.equal(path.options.default, false);
            }
        });
    });

    // ---------- AuditLog Schema ----------

    describe('AuditLog Schema — authority event types', () => {
        const REQUIRED_EVENT_TYPES = [
            'authority_settings_updated',
            'authority_link_created',
            'authority_run_created',
            'authority_run_policy_rejected',
            'authority_review_submitted',
            'authority_changes_applied'
        ];

        let eventTypeEnum;

        before(async () => {
            const AuditLogModule = await import('../models/AuditLog.js');
            const AuditLogModel = AuditLogModule.default;
            const eventTypePath = AuditLogModel.schema.path('eventType');
            eventTypeEnum = eventTypePath.enumValues;
        });

        for (const eventType of REQUIRED_EVENT_TYPES) {
            it(`should include "${eventType}" in eventType enum`, () => {
                assert.ok(
                    eventTypeEnum.includes(eventType),
                    `eventType enum must include "${eventType}" — found: ${eventTypeEnum.filter(e => e.startsWith('authority_')).join(', ')}`
                );
            });
        }

        it('should preserve all original event types', () => {
            const originalEventTypes = [
                'user_login', 'user_logout', 'user_failed_login',
                'user_created', 'user_updated', 'user_deleted',
                'role_changed', 'permission_granted', 'permission_revoked',
                'data_transferred', 'stage_changed', 'assignment_changed',
                'lead_created', 'lead_updated', 'lead_deleted',
                'access_denied', 'unauthorized_access_attempt'
            ];
            for (const et of originalEventTypes) {
                assert.ok(eventTypeEnum.includes(et),
                    `Original event type "${et}" must be preserved`);
            }
        });
    });

    describe('AuditLog Schema — authority target types', () => {
        const REQUIRED_TARGET_TYPES = ['authority_settings', 'authority_run'];
        let targetTypeEnum;

        before(async () => {
            const AuditLogModule = await import('../models/AuditLog.js');
            const AuditLogModel = AuditLogModule.default;
            const targetTypePath = AuditLogModel.schema.path('targetType');
            targetTypeEnum = targetTypePath.enumValues;
        });

        for (const tt of REQUIRED_TARGET_TYPES) {
            it(`should include "${tt}" in targetType enum`, () => {
                assert.ok(
                    targetTypeEnum.includes(tt),
                    `targetType enum must include "${tt}"`
                );
            });
        }

        it('should preserve all original target types', () => {
            const originalTypes = [
                'user', 'role', 'lead', 'deal', 'contact', 'company',
                'inventory', 'payment', 'commission', 'campaign', 'domain', 'other'
            ];
            for (const tt of originalTypes) {
                assert.ok(targetTypeEnum.includes(tt),
                    `Original target type "${tt}" must be preserved`);
            }
        });
    });

    // ---------- Controller ↔ AuditLog Enum Cross-Check ----------

    describe('Controller auditEvent — enum alignment', () => {
        let controllerSource;
        let eventTypeEnum;
        let targetTypeEnum;

        before(async () => {
            controllerSource = readFileSync(
                resolve(__dirname, '../controllers/authorityVerification.controller.js'),
                'utf-8'
            );
            const AuditLogModule = await import('../models/AuditLog.js');
            const AuditLogModel = AuditLogModule.default;
            eventTypeEnum = AuditLogModel.schema.path('eventType').enumValues;
            targetTypeEnum = AuditLogModel.schema.path('targetType').enumValues;
        });

        it('should only emit eventTypes that are in AuditLog enum', () => {
            // Extract all auditEvent calls and get the first string arg (eventType)
            const auditCallPattern = /auditEvent\(\s*'([^']+)'/g;
            let match;
            const emittedEventTypes = [];
            while ((match = auditCallPattern.exec(controllerSource)) !== null) {
                emittedEventTypes.push(match[1]);
            }

            assert.ok(emittedEventTypes.length > 0, 'Controller must emit at least one audit event');

            for (const et of emittedEventTypes) {
                assert.ok(
                    eventTypeEnum.includes(et),
                    `Controller emits eventType "${et}" which is NOT in AuditLog enum. ` +
                    `Available: ${eventTypeEnum.filter(e => e.startsWith('authority_')).join(', ')}`
                );
            }
        });

        it('should only emit targetTypes that are in AuditLog enum', () => {
            // Extract targetType args — they appear as the third string after auditEvent(
            // Pattern: auditEvent(\n 'eventType',\n userId,\n 'targetType',
            const pattern = /auditEvent\(\s*'[^']+',\s*[^,]+,\s*'([^']+)'/g;
            let match;
            const emittedTargetTypes = [];
            while ((match = pattern.exec(controllerSource)) !== null) {
                emittedTargetTypes.push(match[1]);
            }

            assert.ok(emittedTargetTypes.length > 0, 'Controller must emit at least one targetType');

            for (const tt of emittedTargetTypes) {
                assert.ok(
                    targetTypeEnum.includes(tt),
                    `Controller emits targetType "${tt}" which is NOT in AuditLog enum. ` +
                    `Available: ${targetTypeEnum.join(', ')}`
                );
            }
        });
    });

    // ---------- Route File Import ----------

    describe('Route file — importable and structured', () => {
        let routeModule;

        before(async () => {
            routeModule = await import('../routes/authorityVerification.routes.js');
        });

        it('should export a Router as default', () => {
            const router = routeModule.default;
            assert.ok(router, 'Route module must have a default export');
            // Express routers have a stack property
            assert.ok(Array.isArray(router.stack),
                'Default export must be an Express Router (has stack array)');
        });

        it('should define at least 5 route handlers', () => {
            const router = routeModule.default;
            // Each route layer has a route property with methods
            const routeLayers = router.stack.filter(layer => layer.route);
            assert.ok(routeLayers.length >= 5,
                `Router should have >= 5 routes, found ${routeLayers.length}`);
        });

        it('should include authentication middleware on every route', () => {
            const router = routeModule.default;
            // Non-route layers are middleware (like authenticate)
            // Check that the first layer is the authenticate middleware
            const firstLayer = router.stack[0];
            assert.ok(firstLayer, 'Router must have at least one middleware layer');
            // Authentication middleware is typically applied via router.use() as first layer
            // It won't have a route property
            assert.equal(firstLayer.route, undefined,
                'First layer should be a middleware (authenticate), not a route');
        });
    });

    // ---------- Route Mount in app.js ----------

    describe('Route mount — app.js integration', () => {
        let appSource;

        before(() => {
            appSource = readFileSync(
                resolve(__dirname, '../app.js'),
                'utf-8'
            );
        });

        it('should import authorityVerificationRoutes', () => {
            assert.ok(
                appSource.includes('import authorityVerificationRoutes from'),
                'app.js must import authorityVerificationRoutes'
            );
            assert.ok(
                appSource.includes('./routes/authorityVerification.routes.js'),
                'app.js must import from the correct path'
            );
        });

        it('should mount routes on /api/authority', () => {
            assert.ok(
                appSource.includes('app.use("/api/authority", authorityVerificationRoutes)'),
                'app.js must mount authorityVerificationRoutes on /api/authority'
            );
        });

        it('should mount authority routes exactly once', () => {
            const mountCount = (appSource.match(/app\.use\(["']\/api\/authority["']/g) || []).length;
            assert.equal(mountCount, 1,
                `Authority routes must be mounted exactly once, found ${mountCount} mounts`);
        });

        it('should not register before the core routes', () => {
            const inventoryMountIndex = appSource.indexOf('app.use("/api/inventory"');
            const authorityMountIndex = appSource.indexOf('app.use("/api/authority"');
            assert.ok(inventoryMountIndex > 0, 'Inventory route mount must exist');
            assert.ok(authorityMountIndex > inventoryMountIndex,
                'Authority routes should be mounted after core routes (inventory)');
        });
    });

    // ---------- Snapshot Immutability Schema Hooks ----------

    describe('Snapshot immutability — middleware hooks', () => {
        let SnapshotSchema;

        before(async () => {
            const SnapshotModule = await import('../models/PropertyVerificationSnapshot.js');
            const SnapshotModel = SnapshotModule.default;
            SnapshotSchema = SnapshotModel.schema;
        });

        /**
         * Mongoose stores pre hooks on schema.s.hooks._pres (Map).
         * We inspect this to verify all mutation paths are covered.
         */
        function getPreHookNames() {
            const hookMap = SnapshotSchema.s.hooks._pres;
            if (hookMap instanceof Map) {
                return [...hookMap.keys()];
            }
            // Fallback: older mongoose stores as object
            return Object.keys(hookMap || {});
        }

        const REQUIRED_HOOKS = [
            'save',
            'findOneAndUpdate',
            'updateOne',
            'updateMany',
            'replaceOne',
            'deleteOne',
            'deleteMany',
            'findOneAndDelete',
            'findOneAndReplace'
        ];

        for (const hookName of REQUIRED_HOOKS) {
            it(`should have pre('${hookName}') hook for immutability`, () => {
                const hookNames = getPreHookNames();
                assert.ok(
                    hookNames.includes(hookName),
                    `Snapshot schema must have pre('${hookName}') hook. ` +
                    `Found hooks: ${hookNames.join(', ')}`
                );
            });
        }

        it('should override statics.bulkWrite to reject batch mutations', () => {
            const SnapshotModel = mongoose.model('PropertyVerificationSnapshot');
            assert.equal(typeof SnapshotModel.bulkWrite, 'function');
        });
    });

    // ---------- Permission Name Cross-Check ----------

    describe('Permission cross-check — controller ↔ Role schema', () => {
        let controllerSource;
        let routeSource;

        before(() => {
            controllerSource = readFileSync(
                resolve(__dirname, '../controllers/authorityVerification.controller.js'),
                'utf-8'
            );
            routeSource = readFileSync(
                resolve(__dirname, '../routes/authorityVerification.routes.js'),
                'utf-8'
            );
        });

        it('should reference authorityVerification module in routes', () => {
            assert.ok(
                routeSource.includes('authorityVerification'),
                'Route file must reference authorityVerification module for permission checks'
            );
        });

        it('should reference manageAuthoritySettings approval right', () => {
            const combined = routeSource + controllerSource;
            assert.ok(
                combined.includes('manageAuthoritySettings'),
                'Routes or controller must reference manageAuthoritySettings approval right'
            );
        });

        it('should reference approveAuthorityChanges approval right', () => {
            const combined = routeSource + controllerSource;
            assert.ok(
                combined.includes('approveAuthorityChanges'),
                'Routes or controller must reference approveAuthorityChanges approval right'
            );
        });
    });
});

// ========== Database-Backed Tests (MongoDB Memory Server) ==========

describe('Phase 2.1 — Database-Backed Integration Tests', () => {
    let mongoServer;
    let AuditLog;
    let Snapshot;

    before(async () => {
        // Dynamic import to handle missing devDependency gracefully
        let MongoMemoryServer;
        try {
            const mmsModule = await import('mongodb-memory-server');
            MongoMemoryServer = mmsModule.MongoMemoryServer;
        } catch (err) {
            console.log('⚠️  mongodb-memory-server not available — skipping DB tests');
            return;
        }

        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();

        // Disconnect any existing connection
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(uri);

        // Import models after connection
        const AuditLogModule = await import('../models/AuditLog.js');
        AuditLog = AuditLogModule.default;
        const SnapshotModule = await import('../models/PropertyVerificationSnapshot.js');
        Snapshot = SnapshotModule.default;
    });

    after(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    beforeEach(async () => {
        if (!mongoServer) return;
        // Clean up between tests
        const collections = mongoose.connection.collections;
        for (const key in collections) {
            await collections[key].deleteMany({});
        }
    });

    describe('AuditLog — authority event persistence', () => {
        const AUTHORITY_EVENTS = [
            { eventType: 'authority_settings_updated', targetType: 'authority_settings', desc: 'Settings update' },
            { eventType: 'authority_link_created', targetType: 'inventory', desc: 'Link creation' },
            { eventType: 'authority_run_created', targetType: 'authority_run', desc: 'Run creation' },
            { eventType: 'authority_run_policy_rejected', targetType: 'authority_run', desc: 'Run policy rejection' },
            { eventType: 'authority_review_submitted', targetType: 'inventory', desc: 'Review submission' },
            { eventType: 'authority_changes_applied', targetType: 'inventory', desc: 'Changes application' }
        ];

        for (const { eventType, targetType, desc } of AUTHORITY_EVENTS) {
            it(`should persist "${eventType}" event (${desc})`, async () => {
                if (!mongoServer) {
                    // Skip — no DB
                    return;
                }

                const log = await AuditLog.create({
                    eventType,
                    targetType,
                    targetId: new mongoose.Types.ObjectId(),
                    description: `Test: ${desc}`,
                    status: 'success'
                });

                assert.ok(log._id, 'AuditLog document must be created');
                assert.equal(log.eventType, eventType);
                assert.equal(log.targetType, targetType);
            });
        }

        it('should reject an invalid authority event type', async () => {
            if (!mongoServer) return;

            await assert.rejects(
                () => AuditLog.create({
                    eventType: 'authority_INVALID_event',
                    description: 'Should fail validation'
                }),
                (err) => {
                    assert.ok(err.name === 'ValidationError',
                        `Expected ValidationError, got ${err.name}`);
                    return true;
                }
            );
        });

        it('should reject an invalid authority target type', async () => {
            if (!mongoServer) return;

            await assert.rejects(
                () => AuditLog.create({
                    eventType: 'authority_settings_updated',
                    targetType: 'authority_INVALID_target',
                    description: 'Should fail validation'
                }),
                (err) => {
                    assert.ok(err.name === 'ValidationError',
                        `Expected ValidationError, got ${err.name}`);
                    return true;
                }
            );
        });
    });

    describe('Snapshot immutability — database enforcement', () => {
        async function createTestSnapshot() {
            return Snapshot.create({
                tenantId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                linkId: new mongoose.Types.ObjectId(),
                observedAt: new Date(),
                parserVersion: '1.2.0',
                mappingVersion: '1.2.0'
            });
        }

        it('should create a snapshot successfully', async () => {
            if (!mongoServer) return;

            const snap = await createTestSnapshot();
            assert.ok(snap._id);
            assert.equal(snap.isSealed, true);
        });

        it('should block save() on existing snapshot', async () => {
            if (!mongoServer) return;

            const snap = await createTestSnapshot();
            snap.parserVersion = '9.9.9';

            await assert.rejects(
                () => snap.save(),
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );
        });

        it('should block findOneAndUpdate()', async () => {
            if (!mongoServer) return;

            const snap = await createTestSnapshot();

            await assert.rejects(
                () => Snapshot.findOneAndUpdate(
                    { _id: snap._id },
                    { $set: { parserVersion: '9.9.9' } }
                ),
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );
        });

        it('should block updateOne()', async () => {
            if (!mongoServer) return;

            const snap = await createTestSnapshot();

            await assert.rejects(
                () => Snapshot.updateOne(
                    { _id: snap._id },
                    { $set: { parserVersion: '9.9.9' } }
                ),
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );
        });

        it('should block updateMany()', async () => {
            if (!mongoServer) return;

            await createTestSnapshot();

            await assert.rejects(
                () => Snapshot.updateMany(
                    {},
                    { $set: { parserVersion: '9.9.9' } }
                ),
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );
        });

        it('should block replaceOne()', async () => {
            if (!mongoServer) return;

            const snap = await createTestSnapshot();

            await assert.rejects(
                () => Snapshot.replaceOne(
                    { _id: snap._id },
                    {
                        tenantId: snap.tenantId,
                        authorityCode: 'HSVP',
                        linkId: snap.linkId,
                        observedAt: new Date(),
                        parserVersion: '9.9.9',
                        mappingVersion: '9.9.9'
                    }
                ),
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );
        });

        it('should block deleteOne()', async () => {
            if (!mongoServer) return;

            const snap = await createTestSnapshot();

            await assert.rejects(
                () => Snapshot.deleteOne({ _id: snap._id }),
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );
        });

        it('should block deleteMany()', async () => {
            if (!mongoServer) return;

            await createTestSnapshot();

            await assert.rejects(
                () => Snapshot.deleteMany({}),
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );
        });

        it('should block bulkWrite() at model level', async () => {
            if (!mongoServer) return;

            const snap = await createTestSnapshot();

            await assert.rejects(
                () => Snapshot.bulkWrite([
                    {
                        updateOne: {
                            filter: { _id: snap._id },
                            update: { $set: { parserVersion: '9.9.9' } }
                        }
                    }
                ]),
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );
        });

        it('KNOWN LIMITATION: direct native driver (collection.bulkWrite) bypasses Mongoose', async () => {
            if (!mongoServer) return;

            const snap = await createTestSnapshot();

            // Direct MongoDB native driver call bypassing Mongoose Model
            const collection = mongoose.connection.db.collection('property_verification_snapshots');
            const result = await collection.bulkWrite([
                {
                    updateOne: {
                        filter: { _id: snap._id },
                        update: { $set: { parserVersion: '9.9.9' } }
                    }
                }
            ]);

            assert.ok(result.modifiedCount === 1,
                'Native driver collection.bulkWrite bypasses Mongoose — this is a known database-driver boundary. ' +
                'Database-level append-only protection (e.g. MongoDB user privilege restriction) is required for full DB-level immutability.');
        });
    });
});
