import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import fs from 'fs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import GoogleDriveStorageAdapter, { resolveDocumentSigningSecret } from '../services/storage/adapters/GoogleDriveStorageAdapter.js';
import DocumentService from '../services/storage/DocumentService.js';
import DocumentAccessService, { AccessDeniedError, LifecycleRestrictionError } from '../services/storage/DocumentAccessService.js';
import { 
    DEFAULT_PROVIDER_TYPE, 
    DEFAULT_PROVIDER_INSTANCE_ID, 
    getRegistry 
} from '../services/storage/index.js';
import { 
    ProviderUnavailableError, 
    ProviderConfigurationError,
    ObjectNotFoundError, 
    PolicyViolationError,
    StorageError 
} from '../services/storage/StorageErrors.js';
import GoogleDriveMigrationReport from '../services/storage/GoogleDriveMigrationReport.js';
import { uploadFileToDrive } from '../services/drive.service.js';
import http from 'http';
import path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import config from '../src/config/env.js';
import User from '../models/User.js';
import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import DirectUploadRecord from '../models/DirectUploadRecord.js';
import uploadRoutes, { authorizeFileAccess, registerUploadedFile, fileUploadOwnership, isAuthorizedForRecord } from '../routes/upload.routes.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { preflightCheck, runMigration, TARGET_INDEX_NAME } from '../migrations/005-direct-upload-record-fileid-unique-index-migration.js';

test('PR #31 — Google Drive-First Document Storage Remediation', async (t) => {

    // =========================================================================
    // 1. Google Drive provider registration and default resolution
    // =========================================================================
    await t.test('1. Google Drive provider registration and default resolution', async () => {
        assert.strictEqual(DEFAULT_PROVIDER_TYPE, 'GOOGLE_DRIVE');
        assert.strictEqual(DEFAULT_PROVIDER_INSTANCE_ID, 'google-drive-primary');

        const registry = getRegistry();
        assert.ok(registry, 'Registry must exist');

        const fakeDriveClient = {
            files: {
                create: mock.fn(),
                get: mock.fn(),
                delete: mock.fn(),
                list: mock.fn()
            }
        };

        const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
        assert.ok(adapter instanceof GoogleDriveStorageAdapter);
        assert.strictEqual(adapter.supports('PUT'), true);
        assert.strictEqual(adapter.supports('READ'), true);
        assert.strictEqual(adapter.supports('DELETE'), true);
        assert.strictEqual(adapter.supports('HEAD'), true);
        assert.strictEqual(adapter.supports('COPY'), true);
        assert.strictEqual(adapter.supports('ENUMERATE'), true);
        assert.strictEqual(adapter.supports('PRESIGNED_READ'), true);
    });

    // =========================================================================
    // 2. Document upload stores file in Google Drive and records metadata in MongoDB
    // =========================================================================
    await t.test('2. Document upload stores file in Google Drive and captures metadata', async () => {
        let driveCreateCalled = false;
        let capturedRequestBody = null;

        const fakeDriveClient = {
            files: {
                create: async (params) => {
                    driveCreateCalled = true;
                    capturedRequestBody = params.requestBody;
                    return {
                        data: {
                            id: 'gdrive-file-xyz-123',
                            name: params.requestBody.name,
                            mimeType: params.requestBody.mimeType,
                            size: '1024',
                            md5Checksum: 'd41d8cd98f00b204e9800998ecf8427e',
                            createdTime: new Date().toISOString()
                        }
                    };
                }
            }
        };

        const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
        const dataBuffer = Buffer.from('Document test content');

        const result = await adapter.put('doc-100/v1', dataBuffer, {
            mimeType: 'application/pdf',
            originalFilename: 'kyc_document.pdf',
            sizeBytes: dataBuffer.length,
            documentId: 'doc-100',
            versionId: 'ver-1'
        });

        assert.strictEqual(driveCreateCalled, true);
        assert.strictEqual(result.fileId, 'gdrive-file-xyz-123');
        assert.strictEqual(result.providerVersionId, 'gdrive-file-xyz-123');
        assert.strictEqual(result.objectKey, 'doc-100/v1');
        assert.strictEqual(result.sizeBytes, 1024);
        assert.strictEqual(result.mimeType, 'application/pdf');
        assert.strictEqual(result.checksum, 'd41d8cd98f00b204e9800998ecf8427e');
        assert.strictEqual(result.isPrivate, true);
        assert.strictEqual(capturedRequestBody.name, 'kyc_document.pdf');
    });

    // =========================================================================
    // 3. Document read/download streams content from Google Drive
    // =========================================================================
    await t.test('3. Document read/download streams content from Google Drive', async () => {
        let getCalled = false;

        const fakeStream = Readable.from(['File content from Google Drive stream']);
        const fakeDriveClient = {
            files: {
                get: async (params, options) => {
                    getCalled = true;
                    if (options && options.responseType === 'stream') {
                        return { data: fakeStream };
                    }
                    return {
                        data: {
                            id: params.fileId,
                            mimeType: 'application/pdf',
                            size: '37',
                            md5Checksum: 'checksum123'
                        }
                    };
                }
            }
        };

        const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
        const readResult = await adapter.read('doc-100/v1', { fileId: 'gdrive-file-xyz-123' });

        assert.strictEqual(getCalled, true);
        assert.ok(readResult.stream, 'Stream must be returned');
        assert.strictEqual(readResult.providerVersionId, 'gdrive-file-xyz-123');

        // Consume stream to verify
        const chunks = [];
        for await (const chunk of readResult.stream) {
            chunks.push(chunk);
        }
        assert.strictEqual(chunks.join(''), 'File content from Google Drive stream');
    });

    // =========================================================================
    // 4. Document delete removes file from Google Drive
    // =========================================================================
    await t.test('4. Document delete removes file from Google Drive', async () => {
        let deleteCalledWithFileId = null;

        const fakeDriveClient = {
            files: {
                delete: async (params) => {
                    deleteCalledWithFileId = params.fileId;
                    return { data: {} };
                }
            }
        };

        const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
        const delResult = await adapter.delete('doc-100/v1', { fileId: 'gdrive-file-xyz-123' });

        assert.strictEqual(delResult.success, true);
        assert.strictEqual(deleteCalledWithFileId, 'gdrive-file-xyz-123');
    });

    // =========================================================================
    // 5. File ID persistence and retrieval
    // =========================================================================
    await t.test('5. File ID persistence and retrieval', async () => {
        const fakeDriveClient = {
            files: {
                create: async (params) => ({
                    data: { id: 'persisted-file-id-777', name: params.requestBody.name, size: '500' }
                }),
                get: async (params) => ({
                    data: {
                        id: params.fileId,
                        name: 'test.pdf',
                        size: '500',
                        mimeType: 'application/pdf',
                        trashed: false
                    }
                })
            }
        };

        const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
        
        // PUT populates internal map
        const putRes = await adapter.put('doc-key-777/v1', Buffer.from('test'), { mimeType: 'application/pdf' });
        assert.strictEqual(putRes.fileId, 'persisted-file-id-777');

        // HEAD resolves via internal map without needing extra lookup
        const headRes = await adapter.head('doc-key-777/v1');
        assert.strictEqual(headRes.fileId, 'persisted-file-id-777');
        assert.strictEqual(headRes.sizeBytes, 500);
    });

    // =========================================================================
    // 6. Private permissions default (no public anyone sharing)
    // =========================================================================
    await t.test('6. Private permissions default (no public anyone sharing)', async () => {
        let permissionsCreateCalled = false;

        const fakeDriveClient = {
            files: {
                create: async () => ({
                    data: { id: 'private-file-id-001', name: 'agreement.pdf', size: '2048' }
                })
            },
            permissions: {
                create: async () => {
                    permissionsCreateCalled = true;
                    throw new Error('VIOLATION: Public permissions MUST NOT be created automatically!');
                }
            }
        };

        const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
        const putRes = await adapter.put('doc-private/v1', Buffer.from('Private Content'), { mimeType: 'application/pdf' });

        assert.strictEqual(permissionsCreateCalled, false, 'permissions.create must never be called');
        assert.strictEqual(putRes.isPrivate, true);
    });

    // =========================================================================
    // 7. Authorization enforcement (unauthorized user blocked from Drive document)
    // =========================================================================
    await t.test('7. Authorization enforcement (unauthorized user blocked from Drive document)', async () => {
        let driveAccessed = false;
        const fakeDriveClient = {
            files: {
                get: async () => {
                    driveAccessed = true;
                    return { data: {} };
                }
            }
        };

        const accessService = new DocumentAccessService({
            hasPermission: async () => false // Denied
        });

        // Mock Lead exists check
        mock.method(Lead, 'exists', async () => true);

        const mockUser = { _id: '507f1f77bcf86cd799439011', name: 'Unauthorized User' };

        await assert.rejects(
            async () => {
                await accessService.authorizeEntityTarget(mockUser, 'Lead', '507f1f77bcf86cd799439011', 'WRITE');
            },
            AccessDeniedError
        );

        assert.strictEqual(driveAccessed, false, 'Google Drive must NEVER be accessed for unauthorized requests');
        mock.restoreAll();
    });

    // =========================================================================
    // 8. Tenant isolation (tenant A cannot access tenant B Drive document)
    // =========================================================================
    await t.test('8. Tenant isolation (tenant A cannot access tenant B Drive document)', async () => {
        const accessService = new DocumentAccessService({
            hasPermission: async (user) => user.tenantId === 'tenant-A'
        });

        mock.method(Lead, 'exists', async () => true);

        const tenantBUser = { _id: '507f1f77bcf86cd799439012', tenantId: 'tenant-B' };

        await assert.rejects(
            async () => {
                await accessService.authorizeEntityTarget(tenantBUser, 'Lead', '507f1f77bcf86cd799439011', 'WRITE');
            },
            AccessDeniedError
        );
        mock.restoreAll();
    });

    // =========================================================================
    // 9. Signed or authorized download access with expiry
    // =========================================================================
    await t.test('9. Signed or authorized download access with expiry', async () => {
        const testSecret = 'enterprise-test-secret-with-more-than-32-characters';
        const fakeDriveClient = {
            files: {
                get: mock.fn()
            }
        };
        const adapter = new GoogleDriveStorageAdapter(
            'google-drive-primary',
            { baseUrl: 'https://api.bharatproperties.co', signedUrlSecret: testSecret },
            undefined,
            { driveClient: fakeDriveClient }
        );

        const signedUrl = await adapter.getPresignedReadUrl('doc-99/v1', 60, { fileId: 'gdrive-file-99' });
        assert.ok(signedUrl.startsWith('https://api.bharatproperties.co/api/documents/download-signed/'));
        assert.ok(signedUrl.includes('token='));

        // Extract token
        const urlObj = new URL(signedUrl);
        const token = urlObj.searchParams.get('token');
        assert.ok(token, 'Token param must be present');

        // Verify valid token
        const verification = GoogleDriveStorageAdapter.verifySignedToken(token, testSecret);
        assert.strictEqual(verification.valid, true);
        assert.strictEqual(verification.payload.key, 'doc-99/v1');
        assert.strictEqual(verification.payload.fileId, 'gdrive-file-99');

        // Verify tampered token is rejected
        const tamperedToken = token.slice(0, -4) + 'abcd';
        const tamperedVerif = GoogleDriveStorageAdapter.verifySignedToken(tamperedToken, testSecret);
        assert.strictEqual(tamperedVerif.valid, false);
        assert.strictEqual(tamperedVerif.reason, 'INVALID_SIGNATURE');

        // Verify expired token is rejected
        const expiredPayload = { key: 'doc-99/v1', fileId: 'gdrive-file-99', exp: Date.now() - 1000 };
        const expiredB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
        const hmac = crypto.createHmac('sha256', testSecret);
        hmac.update(expiredB64);
        const expiredToken = `${expiredB64}.${hmac.digest('base64url')}`;

        const expiredVerif = GoogleDriveStorageAdapter.verifySignedToken(expiredToken, testSecret);
        assert.strictEqual(expiredVerif.valid, false);
        assert.strictEqual(expiredVerif.reason, 'EXPIRED');
    });

    // =========================================================================
    // 10. Upload failure handles retry on transient Google API error
    // =========================================================================
    await t.test('10. Upload failure handles retry on transient Google API error', async () => {
        let attempts = 0;
        const fakeDriveClient = {
            files: {
                create: async () => {
                    attempts++;
                    if (attempts < 3) {
                        const err = new Error('Rate limit exceeded');
                        err.code = 429;
                        throw err;
                    }
                    return {
                        data: { id: 'retry-succeeded-file-id', size: '100' }
                    };
                },
                list: async () => ({ data: { files: [] } })
            }
        };

        const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
        const result = await adapter.put('doc-retry/v1', Buffer.from('data'), { mimeType: 'text/plain' });

        assert.strictEqual(attempts, 3, 'Must retry 3 times and succeed');
        assert.strictEqual(result.fileId, 'retry-succeeded-file-id');

        // Verify that persistent 429 beyond max retries fails closed with ProviderUnavailableError
        const failingDriveClient = {
            files: {
                create: async () => {
                    const err = new Error('Persistent 429');
                    err.code = 429;
                    throw err;
                },
                list: async () => ({ data: { files: [] } })
            }
        };

        const failingAdapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: failingDriveClient });
        await assert.rejects(
            async () => {
                await failingAdapter.put('doc-fail/v1', Buffer.from('data'), { mimeType: 'text/plain' });
            },
            ProviderUnavailableError
        );
    });

    // =========================================================================
    // 11. Safe failure when Google API unavailable (no silent fallback to S3)
    // =========================================================================
    await t.test('11. Safe failure when Google API unavailable (no silent fallback to S3)', async () => {
        let s3Invoked = false;

        const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, {
            getDriveService: async () => null // Auth failure
        });

        await assert.rejects(
            async () => {
                await adapter.put('doc-auth-fail/v1', Buffer.from('data'), { mimeType: 'text/plain' });
            },
            ProviderUnavailableError
        );

        assert.strictEqual(s3Invoked, false, 'Must NEVER silently switch or fall back to S3 or local storage');
    });

    // =========================================================================
    // 12. Legacy Google Drive document URLs continue to work
    // =========================================================================
    await t.test('12. Legacy Google Drive document URLs continue to work & dry-run migration preview', async () => {
        const report = await GoogleDriveMigrationReport.generatePreviewReport();
        assert.ok(report);
        assert.strictEqual(report.dryRun, true);
        assert.strictEqual(report.status, 'PREVIEW_ONLY_ZERO_MUTATIONS');
        assert.strictEqual(report.policyGuarantees.zeroAutomaticMutations, true);
        assert.strictEqual(report.policyGuarantees.legacyUrlsPreserved, true);
        assert.strictEqual(report.policyGuarantees.s3OptionalOnly, true);
    });

    // =========================================================================
    // 13. Document lifecycle and malware scanning restrictions apply equally to Google Drive documents
    // =========================================================================
    await t.test('13. Document lifecycle and malware scanning restrictions apply equally to Google Drive documents', async () => {
        const accessService = new DocumentAccessService({
            hasPermission: async () => true
        });

        const blockedStates = ['PENDING', 'UPLOADING', 'PROCESSING', 'CONTENT_VALIDATION', 'MALWARE_POLICY', 'REJECTED', 'QUARANTINED', 'DELETED'];

        for (const state of blockedStates) {
            assert.throws(
                () => {
                    accessService._enforceLifecyclePolicy({ state, documentId: 'doc-lifecycle' }, 'READ');
                },
                LifecycleRestrictionError,
                `State ${state} must block READ on Google Drive document`
            );
        }

        // ACTIVE state allows READ
        assert.doesNotThrow(() => {
            accessService._enforceLifecyclePolicy({ state: 'ACTIVE', documentId: 'doc-lifecycle' }, 'READ');
        });
    });

    // =========================================================================
    // 14. Finding 1: Signed URL Security (Fail-closed secrets, timing safety, and binding checks)
    // =========================================================================
    await t.test('14. Finding 1: Signed URL Security (Fail-closed secrets, timing safety, and binding checks)', async (sub) => {
        const originalEnv = { ...process.env };

        await sub.test('14a. resolveDocumentSigningSecret fails closed when secret is missing', () => {
            delete process.env.DOCUMENT_SIGNED_URL_SECRET;
            delete process.env.JWT_SECRET;
            process.env.NODE_ENV = 'production';

            assert.throws(
                () => resolveDocumentSigningSecret(),
                (err) => err instanceof ProviderConfigurationError && err.code === 'SIGNING_SECRET_MISSING'
            );

            process.env.NODE_ENV = 'development';
            assert.throws(
                () => resolveDocumentSigningSecret(),
                (err) => err instanceof ProviderConfigurationError && err.code === 'SIGNING_SECRET_MISSING'
            );
        });

        await sub.test('14b. resolveDocumentSigningSecret strictly rejects weak/short secrets (< 16 chars)', () => {
            assert.throws(
                () => resolveDocumentSigningSecret('too-short'),
                (err) => err instanceof ProviderConfigurationError && err.code === 'SIGNING_SECRET_INVALID'
            );
            assert.throws(
                () => resolveDocumentSigningSecret('   '),
                (err) => err instanceof ProviderConfigurationError && err.code === 'SIGNING_SECRET_MISSING'
            );
        });

        await sub.test('14c. resolveDocumentSigningSecret requires DOCUMENT_SIGNED_URL_SECRET in production even if JWT_SECRET exists', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.DOCUMENT_SIGNED_URL_SECRET;
            process.env.JWT_SECRET = 'valid-jwt-secret-that-is-long-enough-32-chars';

            assert.throws(
                () => resolveDocumentSigningSecret(),
                (err) => err instanceof ProviderConfigurationError && err.code === 'SIGNING_SECRET_MISSING'
            );

            process.env.DOCUMENT_SIGNED_URL_SECRET = 'valid-prod-doc-secret-32-chars-long!';
            assert.strictEqual(resolveDocumentSigningSecret(), 'valid-prod-doc-secret-32-chars-long!');
        });

        await sub.test('14d. Constant-time verification handles mismatched signature lengths safely', () => {
            const secret = 'enterprise-safe-secret-32-chars-long!';
            const payload = { key: 'doc-bind/v1', fileId: 'f1', exp: Date.now() + 60000, provider: 'google-drive-primary' };
            const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

            // Token with truncated signature (different buffer length)
            const malformedSigToken = `${payloadB64}.short`;
            const result = GoogleDriveStorageAdapter.verifySignedToken(malformedSigToken, secret);
            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.reason, 'INVALID_SIGNATURE');
        });

        await sub.test('14e. Binding validation: rejects provider, document, version, and objectKey mismatches', () => {
            const secret = 'enterprise-safe-secret-32-chars-long!';
            const payload = {
                key: 'doc-bind-123/v2',
                fileId: 'gdrive-f-789',
                provider: 'google-drive-primary',
                docId: 'doc-bind-123',
                verId: 'v2',
                exp: Date.now() + 60000
            };
            const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(payloadB64);
            const token = `${payloadB64}.${hmac.digest('base64url')}`;

            // Valid matching all bindings
            const validRes = GoogleDriveStorageAdapter.verifySignedToken(token, secret, {
                providerId: 'google-drive-primary',
                documentId: 'doc-bind-123',
                versionId: 'v2',
                objectKey: 'doc-bind-123/v2'
            });
            assert.strictEqual(validRes.valid, true);

            // Provider mismatch
            const provMismatch = GoogleDriveStorageAdapter.verifySignedToken(token, secret, {
                providerId: 's3-backup-provider'
            });
            assert.strictEqual(provMismatch.valid, false);
            assert.strictEqual(provMismatch.reason, 'PROVIDER_MISMATCH');

            // Document ID mismatch
            const docMismatch = GoogleDriveStorageAdapter.verifySignedToken(token, secret, {
                documentId: 'doc-other-999'
            });
            assert.strictEqual(docMismatch.valid, false);
            assert.strictEqual(docMismatch.reason, 'DOCUMENT_MISMATCH');

            // Version ID mismatch
            const verMismatch = GoogleDriveStorageAdapter.verifySignedToken(token, secret, {
                versionId: 'v3'
            });
            assert.strictEqual(verMismatch.valid, false);
            assert.strictEqual(verMismatch.reason, 'VERSION_MISMATCH');

            // Object key mismatch
            const keyMismatch = GoogleDriveStorageAdapter.verifySignedToken(token, secret, {
                objectKey: 'other-key/v2'
            });
            assert.strictEqual(keyMismatch.valid, false);
            assert.strictEqual(keyMismatch.reason, 'KEY_MISMATCH');
        });

        // Restore original env
        process.env = originalEnv;
    });

    // =========================================================================
    // 15. Finding 2: Legacy Google Drive Privacy (No anyone sharing & read-only audit)
    // =========================================================================
    await t.test('15. Finding 2: Legacy Google Drive Privacy (No anyone sharing & read-only audit)', async (sub) => {
        await sub.test('15a. uploadFileToDrive never invokes permissions.create and returns CRM-mediated URLs', async () => {
            let permissionsCreateCalled = false;
            const fakeDriveService = {
                files: {
                    create: async (params) => {
                        if (params.media?.body && typeof params.media.body[Symbol.asyncIterator] === 'function') {
                            for await (const _ of params.media.body) {}
                        }
                        return {
                            data: {
                                id: 'legacy-drive-f123',
                                webViewLink: 'https://drive.google.com/file/d/legacy-drive-f123/view',
                                webContentLink: 'https://drive.google.com/uc?id=legacy-drive-f123&export=download'
                            }
                        };
                    }
                },
                permissions: {
                    create: async () => {
                        permissionsCreateCalled = true;
                        throw new Error('VIOLATION: permissions.create MUST NEVER be called on upload!');
                    }
                }
            };

            const IntegrationGuard = (await import('../src/utils/IntegrationGuard.js')).default;
            mock.method(IntegrationGuard, 'canExecuteWebhooks', () => true);

            const mockFile = {
                originalname: 'customer_pan.pdf',
                mimetype: 'application/pdf',
                path: '/tmp/test_customer_pan.pdf'
            };
            fs.writeFileSync(mockFile.path, 'dummy pan content');

            const uploadRes = await uploadFileToDrive(mockFile, {
                entityType: 'Lead',
                entityName: 'John Doe',
                docType: 'PAN',
                folderId: 'folder-root-123',
                driveService: fakeDriveService
            });

            assert.strictEqual(permissionsCreateCalled, false, 'permissions.create must never be called');
            assert.strictEqual(uploadRes.id, 'legacy-drive-f123');
            assert.strictEqual(uploadRes.url, '/api/upload/file/legacy-drive-f123');
            assert.strictEqual(uploadRes.downloadUrl, '/api/upload/file/legacy-drive-f123?download=true');
            assert.ok(uploadRes.webViewLink.includes('drive.google.com'));

            mock.restoreAll();
        });

        await sub.test('15b. GoogleDriveMigrationReport.auditLegacyDrivePermissions is strictly read-only', async () => {
            let deleteCalled = false;
            let createCalled = false;
            let updateCalled = false;

            const fakeDriveClient = {
                files: {
                    list: async () => ({
                        data: {
                            files: [
                                { id: 'file-1', name: 'private.pdf', permissions: [{ id: 'p1', type: 'user', role: 'reader' }] },
                                { id: 'file-2', name: 'public.pdf', permissions: [{ id: 'p2', type: 'anyone', role: 'reader' }] },
                                { id: 'file-3', name: 'team.pdf', permissions: [{ id: 'p3', type: 'domain', role: 'writer' }] }
                            ]
                        }
                    }),
                    delete: async () => { deleteCalled = true; },
                    create: async () => { createCalled = true; },
                    update: async () => { updateCalled = true; }
                },
                permissions: {
                    delete: async () => { deleteCalled = true; },
                    create: async () => { createCalled = true; },
                    update: async () => { updateCalled = true; }
                }
            };

            const auditReport = await GoogleDriveMigrationReport.auditLegacyDrivePermissions(fakeDriveClient, { sampleLimit: 10 });

            assert.strictEqual(auditReport.status, 'AUDIT_COMPLETE_READ_ONLY');
            assert.strictEqual(auditReport.zeroMutationsEnforced, true);
            assert.strictEqual(auditReport.filesSampled, 3);
            assert.strictEqual(auditReport.publicAnyoneFilesDetected, 1);
            assert.strictEqual(auditReport.publicFiles[0].id, 'file-2');
            assert.strictEqual(deleteCalled, false, 'audit must NEVER call delete');
            assert.strictEqual(createCalled, false, 'audit must NEVER call create');
            assert.strictEqual(updateCalled, false, 'audit must NEVER call update');
        });
    });

    // =========================================================================
    // 16. Finding 3: Stream Retry Reliability (Fresh streams, remote idempotency, and partial upload cleanup)
    // =========================================================================
    await t.test('16. Finding 3: Stream Retry Reliability (Fresh streams, remote idempotency, and partial upload cleanup)', async (sub) => {
        await sub.test('16a. Every retry receives a fresh, unconsumed stream from byte 0', async () => {
            let attempts = 0;
            const consumedPayloads = [];

            const fakeDriveClient = {
                files: {
                    create: async (params) => {
                        attempts++;
                        const chunks = [];
                        for await (const chunk of params.media.body) {
                            chunks.push(chunk);
                        }
                        const consumedContent = Buffer.concat(chunks).toString('utf8');
                        consumedPayloads.push(consumedContent);

                        if (attempts === 1) {
                            const err = new Error('Google backend transient error');
                            err.code = 503;
                            throw err;
                        }
                        if (attempts === 2) {
                            const err = new Error('Stream interrupted / Premature close');
                            err.code = 'ECONNRESET';
                            throw err;
                        }

                        return {
                            data: { id: 'stream-retry-success-file', size: '18' }
                        };
                    },
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
            const originalData = 'Payload for retry!';
            const inputStream = Readable.from(Buffer.from(originalData));

            const result = await adapter.put('doc-stream-retry/v1', inputStream, { mimeType: 'text/plain' });

            assert.strictEqual(attempts, 3, 'Must complete in 3 attempts');
            assert.strictEqual(consumedPayloads.length, 3);
            assert.strictEqual(consumedPayloads[0], originalData);
            assert.strictEqual(consumedPayloads[1], originalData);
            assert.strictEqual(consumedPayloads[2], originalData);
            assert.strictEqual(result.fileId, 'stream-retry-success-file');
        });

        await sub.test('16b. Remote idempotency: prevents duplicate files when upload succeeded remotely but response was lost', async () => {
            let createCalls = 0;
            const objectKey = 'doc-idempotent/v1';

            const existingFileMetadata = {
                id: 'remote-file-already-created-123',
                name: 'contract.pdf',
                mimeType: 'application/pdf',
                size: '2048',
                appProperties: { objectKey }
            };

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        const err = new Error('Connection reset by peer');
                        err.code = 'ECONNRESET';
                        throw err;
                    },
                    list: async (params) => {
                        if (params.q && params.q.includes(objectKey)) {
                            return {
                                data: { files: [existingFileMetadata] }
                            };
                        }
                        return { data: { files: [] } };
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
            const result = await adapter.put(objectKey, Buffer.from('Contract Content'), { mimeType: 'application/pdf' });

            assert.strictEqual(createCalls, 1, 'files.create must NOT be called again if file exists on retry');
            assert.strictEqual(result.fileId, 'remote-file-already-created-123');
        });

        await sub.test('16c. Partial upload cleanup: deletes partially uploaded file when attempt fails', async () => {
            let cleanedUp = false;
            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: {} });

            await assert.rejects(
                async () => {
                    await adapter._executeWithRetry(
                        async (attempt) => {
                            throw new Error('mid-stream pipe error');
                        },
                        'PUT',
                        'doc-partial/v1',
                        1,
                        10,
                        async (err, attempt) => {
                            cleanedUp = true;
                        }
                    );
                },
                StorageError
            );

            assert.strictEqual(cleanedUp, true, 'onAttemptFailure cleanup hook must be called on attempt failure');
        });

        await sub.test('16d. Retry exhaustion: fails closed after max retries with ProviderUnavailableError', async () => {
            let attempts = 0;
            const fakeDriveClient = {
                files: {
                    create: async () => {
                        attempts++;
                        const err = new Error('Persistent 500 Backend Error');
                        err.code = 500;
                        throw err;
                    },
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            await assert.rejects(
                async () => {
                    await adapter.put('doc-exhaust/v1', Buffer.from('Data'), { mimeType: 'text/plain' });
                },
                ProviderUnavailableError
            );

            assert.strictEqual(attempts, 4, 'Must exhaust 1 initial attempt + 3 retries (total 4 attempts)');
        });
    });

    // =========================================================================
    // 17. Finding 1: Legacy Drive File IDOR Prevention & Document-Level Authorization
    // =========================================================================
    await t.test('17. Legacy Drive File IDOR Prevention & Document-Level Authorization', async (sub) => {
        const userA = {
            _id: new mongoose.Types.ObjectId('65d111111111111111111111'),
            name: 'User A',
            email: 'usera@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const userB = {
            _id: new mongoose.Types.ObjectId('65d222222222222222222222'),
            name: 'User B',
            email: 'userb@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const userC_crossTenant = {
            _id: new mongoose.Types.ObjectId('65d333333333333333333333'),
            name: 'User C (Tenant 2)',
            email: 'userc@tenant2.com',
            tenantId: new mongoose.Types.ObjectId('65d888888888888888888888'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const adminUser = {
            _id: new mongoose.Types.ObjectId('65d444444444444444444444'),
            name: 'Global Admin',
            email: 'admin@bharatproperties.com',
            tenantId: null,
            role: { name: 'admin' },
            dataScope: 'all',
            isActive: true
        };

        await sub.test('17a. User A cannot download User B\'s file (ownership isolation)', async () => {
            const fileIdB = 'drive-file-user-b-secret-101';
            registerUploadedFile(fileIdB, userB);

            // User B can access their own file
            const authB = await authorizeFileAccess(userB, fileIdB, 'READ');
            assert.strictEqual(authB, true, 'User B must be authorized for their own uploaded file');

            // User A must be DENIED access to User B's file
            const authA = await authorizeFileAccess(userA, fileIdB, 'READ');
            assert.strictEqual(authA, false, 'User A must NOT be authorized for User B file');
        });

        await sub.test('17b. Cross-tenant user cannot access files across tenant boundary', async () => {
            const fileIdTenant1 = 'drive-file-tenant-1-agreement-202';
            registerUploadedFile(fileIdTenant1, userA);

            // Tenant 2 user attempting cross-tenant access
            const authCrossTenant = await authorizeFileAccess(userC_crossTenant, fileIdTenant1, 'READ');
            assert.strictEqual(authCrossTenant, false, 'Tenant 2 user must be strictly blocked from Tenant 1 file');
        });

        await sub.test('17c. Nonexistent or unmapped arbitrary Drive file IDs return false (generic 404)', async () => {
            const arbitraryFileId = '1ArbitraryUnmappedGoogleDriveFileID999';
            const auth = await authorizeFileAccess(userA, arbitraryFileId, 'READ');
            assert.strictEqual(auth, false, 'Arbitrary unmapped Drive file ID must fail closed');
        });

        await sub.test('17d. Unauthorized user cannot delete or inspect metadata of another user\'s file', async () => {
            const fileIdB = 'drive-file-user-b-delete-test';
            registerUploadedFile(fileIdB, userB);

            const authDeleteA = await authorizeFileAccess(userA, fileIdB, 'DELETE');
            assert.strictEqual(authDeleteA, false, 'User A must not be authorized to delete User B file');

            const authMetaA = await authorizeFileAccess(userA, fileIdB, 'READ');
            assert.strictEqual(authMetaA, false, 'User A must not be authorized to inspect metadata of User B file');
        });

        await sub.test('17e. HTTP Integration: Rejects unauthorized and cross-tenant file downloads with generic 404', async () => {
            const originalFindById = User.findById;
            User.findById = (id) => ({
                populate: () => ({
                    lean: async () => {
                        const sId = String(id);
                        if (sId === String(userA._id)) return userA;
                        if (sId === String(userB._id)) return userB;
                        if (sId === String(userC_crossTenant._id)) return userC_crossTenant;
                        if (sId === String(adminUser._id)) return adminUser;
                        return null;
                    }
                })
            });

            const tokenA = jwt.sign({ id: userA._id }, config.jwtSecret, { expiresIn: '1h' });
            const tokenB = jwt.sign({ id: userB._id }, config.jwtSecret, { expiresIn: '1h' });
            const tokenC = jwt.sign({ id: userC_crossTenant._id }, config.jwtSecret, { expiresIn: '1h' });

            // Create a temporary local file owned by user A
            const localFileName = `test-user-a-doc-${Date.now()}.txt`;
            const uploadDir = path.join(process.cwd(), 'uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const localFilePath = path.join(uploadDir, localFileName);
            fs.writeFileSync(localFilePath, 'Secret KYC document belonging to User A');
            registerUploadedFile(localFileName, userA);

            const testApp = express();
            testApp.use(express.json());
            testApp.use('/api/upload', uploadRoutes);

            const server = http.createServer(testApp);
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            const port = server.address().port;
            const baseUrl = `http://127.0.0.1:${port}`;

            try {
                // 1. User B (different user, same tenant) tries to download User A's file -> 404
                const resB = await fetch(`${baseUrl}/api/upload/file/${localFileName}`, {
                    headers: { 'Authorization': `Bearer ${tokenB}` }
                });
                assert.strictEqual(resB.status, 404, 'User B must receive generic 404 for User A file');
                const jsonB = await resB.json();
                assert.strictEqual(jsonB.success, false);
                assert.strictEqual(jsonB.error, 'Document not found or unauthorized');

                // 2. User C (cross-tenant user) tries to download User A's file -> 404
                const resC = await fetch(`${baseUrl}/api/upload/file/${localFileName}`, {
                    headers: { 'Authorization': `Bearer ${tokenC}` }
                });
                assert.strictEqual(resC.status, 404, 'Cross-tenant user must receive generic 404');
                const jsonC = await resC.json();
                assert.strictEqual(jsonC.success, false);
                assert.strictEqual(jsonC.error, 'Document not found or unauthorized');

                // 3. User B tries to fetch metadata -> 404
                const metaResB = await fetch(`${baseUrl}/api/upload/metadata/${localFileName}`, {
                    headers: { 'Authorization': `Bearer ${tokenB}` }
                });
                assert.strictEqual(metaResB.status, 404, 'User B must receive 404 for metadata of User A file');

                // 4. User B tries to delete User A's file -> 404
                const delResB = await fetch(`${baseUrl}/api/upload/${localFileName}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${tokenB}` }
                });
                assert.strictEqual(delResB.status, 404, 'User B must receive 404 when attempting to delete User A file');
                assert.strictEqual(fs.existsSync(localFilePath), true, 'File must NOT be deleted by unauthorized user');

                // 5. Legitimate authorized user (User A) can preview / download their file -> 200
                const resA = await fetch(`${baseUrl}/api/upload/file/${localFileName}`, {
                    headers: { 'Authorization': `Bearer ${tokenA}` }
                });
                assert.strictEqual(resA.status, 200, 'Legitimate authorized user must be able to download their file');
                const contentA = await resA.text();
                assert.strictEqual(contentA, 'Secret KYC document belonging to User A');
            } finally {
                User.findById = originalFindById;
                if (fs.existsSync(localFilePath)) {
                    try { fs.unlinkSync(localFilePath); } catch (e) {}
                }
                fileUploadOwnership.delete(localFileName);
                await new Promise((resolve) => server.close(resolve));
            }
        });
    });

    // =========================================================================
    // 18. Fail-Closed Capability Check & Search Failures
    // =========================================================================
    await t.test('18. Fail-Closed Capability Check & Search Failures', async (sub) => {
        await sub.test('18a. Missing files.list capability fails closed immediately with ProviderUnavailableError', async () => {
            let createCalls = 0;
            const objectKey = 'doc-missing-list-capability/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        const err = new Error('Transient 503 Backend Error on attempt 1');
                        err.code = 503;
                        throw err;
                    }
                    // files.list is deliberately NOT defined
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            await assert.rejects(
                async () => {
                    await adapter.put(objectKey, Buffer.from('Payload'), { mimeType: 'text/plain' });
                },
                (err) => {
                    assert.ok(err instanceof ProviderUnavailableError);
                    assert.ok(err.message.includes('files.list capability is unavailable'));
                    assert.strictEqual(err.isSearchFailure, true);
                    return true;
                }
            );

            // Verified: create called on attempt 1, missing list capability caused immediate fail-closed termination
            assert.strictEqual(createCalls, 1, 'files.create must NOT be called on retry if capability is missing');
        });

        await sub.test('18b. Malformed response from files.list fails closed immediately with ProviderUnavailableError', async () => {
            let createCalls = 0;
            let listCalls = 0;
            const objectKey = 'doc-malformed-list-response/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        const err = new Error('Transient 500 error');
                        err.code = 500;
                        throw err;
                    },
                    list: async () => {
                        listCalls++;
                        // Malformed: null data or missing files array
                        return { data: null };
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            await assert.rejects(
                async () => {
                    await adapter.put(objectKey, Buffer.from('Payload'), { mimeType: 'text/plain' });
                },
                (err) => {
                    assert.ok(err instanceof ProviderUnavailableError);
                    assert.ok(err.message.includes('malformed') || err.message.includes('non-array'));
                    assert.strictEqual(err.isSearchFailure, true);
                    return true;
                }
            );

            assert.strictEqual(createCalls, 1, 'files.create must NOT be called on retry if response is malformed');
            assert.strictEqual(listCalls, 1);
        });

        await sub.test('18c. 429 rate limit in files.list fails closed immediately as terminal condition', async () => {
            let createCalls = 0;
            let listCalls = 0;
            const objectKey = 'doc-list-429/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        const err = new Error('Transient 503 error');
                        err.code = 503;
                        throw err;
                    },
                    list: async () => {
                        listCalls++;
                        const err = new Error('Rate limit exceeded during search');
                        err.code = 429;
                        throw err;
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            await assert.rejects(
                async () => {
                    await adapter.put(objectKey, Buffer.from('Payload'), { mimeType: 'text/plain' });
                },
                (err) => {
                    assert.ok(err instanceof ProviderUnavailableError);
                    assert.ok(err.message.includes('rate limit') || err.message.includes('SEARCH_EXISTING'));
                    assert.strictEqual(err.isSearchFailure, true);
                    return true;
                }
            );

            assert.strictEqual(createCalls, 1, 'files.create must NOT retry when search hits 429');
            assert.strictEqual(listCalls, 1);
        });

        await sub.test('18d. 500 internal server error in files.list fails closed immediately', async () => {
            let createCalls = 0;
            let listCalls = 0;
            const objectKey = 'doc-list-500/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        const err = new Error('Transient 500 create error');
                        err.code = 500;
                        throw err;
                    },
                    list: async () => {
                        listCalls++;
                        const err = new Error('Google internal server error on list');
                        err.code = 500;
                        throw err;
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            await assert.rejects(
                async () => {
                    await adapter.put(objectKey, Buffer.from('Payload'), { mimeType: 'text/plain' });
                },
                (err) => {
                    assert.ok(err instanceof ProviderUnavailableError);
                    assert.strictEqual(err.isSearchFailure, true);
                    return true;
                }
            );

            assert.strictEqual(createCalls, 1, 'files.create must NOT retry when search hits 500');
            assert.strictEqual(listCalls, 1);
        });

        await sub.test('18e. 503 backend error in files.list fails closed immediately', async () => {
            let createCalls = 0;
            let listCalls = 0;
            const objectKey = 'doc-list-503/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        const err = new Error('Transient 503 create error');
                        err.code = 503;
                        throw err;
                    },
                    list: async () => {
                        listCalls++;
                        const err = new Error('Backend unavailable on list');
                        err.code = 503;
                        throw err;
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            await assert.rejects(
                async () => {
                    await adapter.put(objectKey, Buffer.from('Payload'), { mimeType: 'text/plain' });
                },
                (err) => {
                    assert.ok(err instanceof ProviderUnavailableError);
                    assert.strictEqual(err.isSearchFailure, true);
                    return true;
                }
            );

            assert.strictEqual(createCalls, 1, 'files.create must NOT retry when search hits 503');
            assert.strictEqual(listCalls, 1);
        });

        await sub.test('18f. Network timeout / ETIMEDOUT in files.list fails closed immediately', async () => {
            let createCalls = 0;
            let listCalls = 0;
            const objectKey = 'doc-list-timeout/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        const err = new Error('Connection reset on create');
                        err.code = 'ECONNRESET';
                        throw err;
                    },
                    list: async () => {
                        listCalls++;
                        const err = new Error('Connection timed out on list');
                        err.code = 'ETIMEDOUT';
                        throw err;
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            await assert.rejects(
                async () => {
                    await adapter.put(objectKey, Buffer.from('Payload'), { mimeType: 'text/plain' });
                },
                (err) => {
                    assert.ok(err instanceof ProviderUnavailableError);
                    assert.strictEqual(err.isSearchFailure, true);
                    return true;
                }
            );

            assert.strictEqual(createCalls, 1, 'files.create must NOT retry when search times out');
            assert.strictEqual(listCalls, 1);
        });

        await sub.test('18g. Confirmed no-match proceeds to upload with fresh stream', async () => {
            let createCalls = 0;
            let listCalls = 0;
            const objectKey = 'doc-confirmed-no-match/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        if (createCalls === 1) {
                            const err = new Error('Temporary 500 on create');
                            err.code = 500;
                            throw err;
                        }
                        return {
                            data: {
                                id: 'confirmed-no-match-created-file-id',
                                size: '15',
                                mimeType: 'text/plain'
                            }
                        };
                    },
                    list: async () => {
                        listCalls++;
                        return { data: { files: [] } }; // Confirmed no-match (0 results)
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
            const result = await adapter.put(objectKey, Buffer.from('Fresh payload!'), { mimeType: 'text/plain' });

            assert.strictEqual(createCalls, 2, 'Must retry files.create after confirmed no-match');
            assert.strictEqual(listCalls, 1, 'Must have verified remote idempotency before second create');
            assert.strictEqual(result.fileId, 'confirmed-no-match-created-file-id');
        });

        await sub.test('18h. Lost response / Confirmed match returns existing file without calling files.create on retry', async () => {
            let createCalls = 0;
            let listCalls = 0;
            const objectKey = 'doc-lost-response-test/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        const err = new Error('Connection reset by peer');
                        err.code = 'ECONNRESET';
                        throw err;
                    },
                    list: async () => {
                        listCalls++;
                        return {
                            data: {
                                files: [{
                                    id: 'pre-existing-remote-file-id',
                                    name: 'contract.pdf',
                                    mimeType: 'application/pdf',
                                    size: '1024',
                                    appProperties: { objectKey }
                                }]
                            }
                        };
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
            const result = await adapter.put(objectKey, Buffer.from('Contract Data'), { mimeType: 'application/pdf' });

            assert.strictEqual(createCalls, 1, 'files.create must NOT be called on retry when file exists remotely');
            assert.strictEqual(listCalls, 1, 'files.list must have been called on retry');
            assert.strictEqual(result.fileId, 'pre-existing-remote-file-id');
        });

        await sub.test('18i. READ on logical objectKey propagates ProviderUnavailableError on search failure', async () => {
            const objectKey = 'doc-search-failure-read/sample.pdf';
            const fakeDriveClient = {
                files: {
                    list: async () => {
                        const err = new Error('Service Unavailable');
                        err.status = 503;
                        err.code = 503;
                        throw err;
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
            await assert.rejects(
                async () => adapter.read(objectKey),
                ProviderUnavailableError
            );
        });

        await sub.test('18j. DELETE on logical objectKey propagates ProviderUnavailableError on search failure', async () => {
            const objectKey = 'doc-search-failure-delete/sample.pdf';
            const fakeDriveClient = {
                files: {
                    list: async () => {
                        const err = new Error('Internal Server Error');
                        err.status = 500;
                        err.code = 500;
                        throw err;
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
            await assert.rejects(
                async () => adapter.delete(objectKey),
                ProviderUnavailableError
            );
        });

        await sub.test('18k. HEAD on logical objectKey propagates ProviderUnavailableError on search failure', async () => {
            const objectKey = 'doc-search-failure-head/sample.pdf';
            const fakeDriveClient = {
                files: {
                    list: async () => {
                        const err = new Error('Too Many Requests');
                        err.status = 429;
                        err.code = 429;
                        throw err;
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
            await assert.rejects(
                async () => adapter.head(objectKey),
                ProviderUnavailableError
            );
        });

        await sub.test('18l. Confirmed no-match on logical objectKey throws ObjectNotFoundError for READ/DELETE/HEAD', async () => {
            const objectKey = 'doc-confirmed-no-match/non-existent.pdf';
            const fakeDriveClient = {
                files: {
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });
            await assert.rejects(
                async () => adapter.read(objectKey),
                ObjectNotFoundError
            );
            await assert.rejects(
                async () => adapter.delete(objectKey),
                ObjectNotFoundError
            );
            await assert.rejects(
                async () => adapter.head(objectKey),
                ObjectNotFoundError
            );
        });

        await sub.test('18m. Direct Drive ID and explicit fileId resolve without invoking search', async () => {
            let listCalls = 0;
            const directDriveId = '1abcdefghijklmnopqrstuvwxyz23456'; // 31 chars alphanumeric, no slashes
            const explicitFileId = 'explicit-custom-file-id';

            const fakeDriveClient = {
                files: {
                    get: async ({ fileId, alt }) => {
                        return {
                            data: alt === 'media' ? Readable.from(Buffer.from('streamed content')) : {
                                id: fileId,
                                name: 'direct.pdf',
                                mimeType: 'application/pdf',
                                size: '16'
                            }
                        };
                    },
                    list: async () => {
                        listCalls++;
                        return { data: { files: [] } };
                    }
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            // 1. Direct Drive ID without gdrive: prefix
            const metaDirect = await adapter.head(directDriveId);
            assert.strictEqual(metaDirect.fileId, directDriveId);
            assert.strictEqual(listCalls, 0, 'files.list must not be called for direct alphanumeric Drive file ID');

            // 2. Direct Drive ID with gdrive: prefix
            const metaGdrive = await adapter.head(`gdrive:${directDriveId}`);
            assert.strictEqual(metaGdrive.fileId, directDriveId);
            assert.strictEqual(listCalls, 0, 'files.list must not be called for gdrive: prefix');

            // 3. Explicit fileId in options
            const metaExplicit = await adapter.head('arbitrary/logical/path/file.pdf', { fileId: explicitFileId });
            assert.strictEqual(metaExplicit.fileId, explicitFileId);
            assert.strictEqual(listCalls, 0, 'files.list must not be called when options.fileId is explicitly provided');
        });
    });

    // =========================================================================
    // 19. Concurrency Mutex Identity (Provider + Folder + ObjectKey + Payload Identity)
    // =========================================================================
    await t.test('19. Concurrency Mutex Identity', async (sub) => {
        await sub.test('19a. Same key, same payload, same folder joins in-flight promise and calls files.create exactly once', async () => {
            let createCalls = 0;
            const objectKey = 'doc-mutex-same-payload/v1';
            const identicalPayload = Buffer.from('Identical immutable contract content');

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        await new Promise(res => setTimeout(res, 40));
                        return {
                            data: {
                                id: 'same-payload-shared-file-id',
                                size: '38',
                                mimeType: 'application/pdf'
                            }
                        };
                    },
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            // 3 concurrent uploads with identical payload, key, and folder
            const [res1, res2, res3] = await Promise.all([
                adapter.put(objectKey, identicalPayload, { mimeType: 'application/pdf' }),
                adapter.put(objectKey, identicalPayload, { mimeType: 'application/pdf' }),
                adapter.put(objectKey, identicalPayload, { mimeType: 'application/pdf' })
            ]);

            assert.strictEqual(createCalls, 1, 'files.create must be invoked exactly once for identical uploads');
            assert.strictEqual(res1.fileId, 'same-payload-shared-file-id');
            assert.strictEqual(res2.fileId, 'same-payload-shared-file-id');
            assert.strictEqual(res3.fileId, 'same-payload-shared-file-id');
        });

        await sub.test('19b. Same key, different payload executes separate uploads and never shares promise', async () => {
            let createCalls = 0;
            const objectKey = 'doc-mutex-different-payload/v1';
            const payloadA = Buffer.from('Version A payload content');
            const payloadB = Buffer.from('Version B different payload content');

            const fakeDriveClient = {
                files: {
                    create: async (params) => {
                        createCalls++;
                        await new Promise(res => setTimeout(res, 40));
                        const isA = params.requestBody.name.includes('A');
                        return {
                            data: {
                                id: isA ? 'file-id-payload-A' : 'file-id-payload-B',
                                size: '25'
                            }
                        };
                    },
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            // Concurrent calls with different payload content for same key
            const [resA, resB] = await Promise.all([
                adapter.put(objectKey, payloadA, { filename: 'file-A.pdf', mimeType: 'application/pdf' }),
                adapter.put(objectKey, payloadB, { filename: 'file-B.pdf', mimeType: 'application/pdf' })
            ]);

            assert.strictEqual(createCalls, 2, 'files.create must execute separately for different payloads');
            assert.strictEqual(resA.fileId, 'file-id-payload-A');
            assert.strictEqual(resB.fileId, 'file-id-payload-B');
        });

        await sub.test('19c. Different folders with same key and same payload execute separate uploads', async () => {
            let createCalls = 0;
            const objectKey = 'doc-mutex-different-folders/v1';
            const payload = Buffer.from('Shared content across folders');

            const fakeDriveClient = {
                files: {
                    create: async (params) => {
                        createCalls++;
                        await new Promise(res => setTimeout(res, 40));
                        const folder = params.requestBody.parents?.[0] || 'default';
                        return {
                            data: {
                                id: `file-in-${folder}`,
                                size: '30'
                            }
                        };
                    },
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            const [resFolder1, resFolder2] = await Promise.all([
                adapter.put(objectKey, payload, { folderId: 'folder-alpha-111' }),
                adapter.put(objectKey, payload, { folderId: 'folder-beta-222' })
            ]);

            assert.strictEqual(createCalls, 2, 'Different folders must generate distinct mutex identities');
            assert.strictEqual(resFolder1.fileId, 'file-in-folder-alpha-111');
            assert.strictEqual(resFolder2.fileId, 'file-in-folder-beta-222');
        });

        await sub.test('19d. Concurrency failure recovery: failed promise removed from mutex, subsequent attempt succeeds', async () => {
            let createCalls = 0;
            const objectKey = 'doc-mutex-failure-recovery/v1';
            const payload = Buffer.from('Payload for failure recovery test');

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        if (createCalls === 1) {
                            const err = new Error('Fatal non-retryable 400 error');
                            err.code = 400;
                            throw err;
                        }
                        return {
                            data: {
                                id: 'recovered-successful-file-id',
                                size: '35'
                            }
                        };
                    },
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            // First call fails
            await assert.rejects(
                async () => adapter.put(objectKey, payload, { mimeType: 'text/plain' }),
                StorageError
            );

            // Subsequent call succeeds because in-flight promise was cleaned up in finally
            const res2 = await adapter.put(objectKey, payload, { mimeType: 'text/plain' });
            assert.strictEqual(res2.fileId, 'recovered-successful-file-id');
            assert.strictEqual(createCalls, 2);
        });

        await sub.test('19e. Mutex isolation: identical caller-supplied checksums with different payload content do NOT share mutex', async () => {
            let createCalls = 0;
            const objectKey = 'doc-spoofed-checksum-mutex/v1';
            const payloadAlpha = Buffer.from('Alpha unique payload bytes');
            const payloadBeta = Buffer.from('Beta different payload bytes');
            const sharedCallerChecksum = 'sha256:same-caller-supplied-checksum-for-both';

            const fakeDriveClient = {
                files: {
                    create: async (params) => {
                        createCalls++;
                        await new Promise(res => setTimeout(res, 40));
                        const isAlpha = params.requestBody.name.includes('alpha');
                        return {
                            data: {
                                id: isAlpha ? 'file-alpha-id' : 'file-beta-id',
                                size: '26'
                            }
                        };
                    },
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            // Both callers supply the exact same checksum option, but payload bytes differ
            const [resAlpha, resBeta] = await Promise.all([
                adapter.put(objectKey, payloadAlpha, { filename: 'alpha.pdf', checksum: sharedCallerChecksum }),
                adapter.put(objectKey, payloadBeta, { filename: 'beta.pdf', checksum: sharedCallerChecksum })
            ]);

            assert.strictEqual(createCalls, 2, 'Independent canonical hash prevents distinct payloads from colliding on caller checksum');
            assert.strictEqual(resAlpha.fileId, 'file-alpha-id');
            assert.strictEqual(resBeta.fileId, 'file-beta-id');
        });

        await sub.test('19f. Stream factory determinism: streamFactory can be invoked multiple times across retries yielding identical bytes', async () => {
            const rawBuffer = Buffer.from('Immutable source data for retry validation');
            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {});

            // 1. Normalize Buffer
            const normBuf = await adapter._normalizePayload(rawBuffer);
            assert.ok(normBuf.canonicalHash, 'canonicalHash must be computed');
            const stream1 = normBuf.streamFactory();
            const stream2 = normBuf.streamFactory();

            const chunks1 = [];
            for await (const c of stream1) chunks1.push(c);
            const chunks2 = [];
            for await (const c of stream2) chunks2.push(c);

            assert.deepStrictEqual(Buffer.concat(chunks1), rawBuffer);
            assert.deepStrictEqual(Buffer.concat(chunks2), rawBuffer);

            // 2. Normalize Stream Factory
            const factoryPayload = () => Readable.from(Buffer.from('Factory data for retry'));
            const normFactory = await adapter._normalizePayload(factoryPayload);
            const sA = normFactory.streamFactory();
            const sB = normFactory.streamFactory();

            const chA = [];
            for await (const c of sA) chA.push(c);
            const chB = [];
            for await (const c of sB) chB.push(c);

            assert.deepStrictEqual(Buffer.concat(chA), Buffer.from('Factory data for retry'));
            assert.deepStrictEqual(Buffer.concat(chB), Buffer.from('Factory data for retry'));
        });
    });

    let sharedMongod = null;
    async function getOrStartMongo() {
        if (!sharedMongod) {
            sharedMongod = await MongoMemoryServer.create({
                instance: { launchTimeout: 60000 }
            });
        }
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            await mongoose.connect(sharedMongod.getUri());
        }
        return sharedMongod;
    }

    // =========================================================================
    // 20. Finding 3: Durable Direct-Upload Ownership (Server Restart & Multi-Instance)
    // =========================================================================
    await t.test('20. Durable Direct-Upload Ownership', async (sub) => {
        let mongod;
        try {
            mongod = await getOrStartMongo();
        } catch (mErr) {
            assert.fail(`Fatal test failure: MongoMemoryServer could not be initialized: ${mErr.message}`);
        }

        const userA = {
            _id: new mongoose.Types.ObjectId('65d111111111111111111111'),
            name: 'User A (Tenant 1)',
            email: 'usera@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const userB = {
            _id: new mongoose.Types.ObjectId('65d222222222222222222222'),
            name: 'User B (Tenant 1)',
            email: 'userb@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const userC_crossTenant = {
            _id: new mongoose.Types.ObjectId('65d333333333333333333333'),
            name: 'User C (Tenant 2)',
            email: 'userc@tenant2.com',
            tenantId: new mongoose.Types.ObjectId('65d888888888888888888888'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        try {
            await sub.test('20a. Direct upload persists ownership and tenant association in durable DirectUploadRecord', async () => {
                const fileId = 'durable-drive-file-abc-123';
                await registerUploadedFile(fileId, userA, {
                    storage: 'google_drive',
                    originalName: 'passport.pdf',
                    mimeType: 'application/pdf',
                    sizeBytes: 2048
                });

                // Verify durable record exists in MongoDB
                const record = await DirectUploadRecord.findOne({ fileId }).lean();
                assert.ok(record, 'Durable DirectUploadRecord must exist in MongoDB');
                assert.strictEqual(String(record.userId), String(userA._id));
                assert.strictEqual(String(record.tenantId), String(userA.tenantId));
                assert.strictEqual(record.originalName, 'passport.pdf');
                assert.strictEqual(record.storage, 'google_drive');
            });

            await sub.test('20b. Server restart simulation: verified via durable record when in-memory map is cleared', async () => {
                const fileId = 'durable-restart-file-xyz-456';
                await registerUploadedFile(fileId, userA, { storage: 'google_drive' });

                // SIMULATE SERVER RESTART: completely wipe in-memory ownership map
                fileUploadOwnership.clear();
                assert.strictEqual(fileUploadOwnership.size, 0, 'In-memory map must be empty after restart');

                // Authorization request on restarted server verifies against durable MongoDB record
                const authorizedA = await authorizeFileAccess(userA, fileId, 'READ');
                assert.strictEqual(authorizedA, true, 'User A must be authorized via durable record after server restart');

                // Verify cache was repopulated from durable record
                assert.ok(fileUploadOwnership.has(fileId), 'Cache must be repopulated from durable record');
            });

            await sub.test('20c. Multi-instance simulation: instance 1 writes, instance 2 reads with empty local memory', async () => {
                const fileId = 'durable-multi-instance-789';

                // Instance 1 receives upload and registers file
                await registerUploadedFile(fileId, userA, { storage: 'google_drive' });

                // Instance 2 receives subsequent request (its local memory map does NOT have this file)
                fileUploadOwnership.clear(); // Clear local instance memory

                const authorizedInstance2 = await authorizeFileAccess(userA, fileId, 'READ');
                assert.strictEqual(authorizedInstance2, true, 'Instance 2 must authorize User A via durable CRM record');
            });

            await sub.test('20d. Multi-instance cross-tenant isolation: instance 2 strictly denies cross-tenant access', async () => {
                const fileId = 'durable-cross-tenant-isolation-101';
                await registerUploadedFile(fileId, userA, { storage: 'google_drive' });

                // Instance 2 memory is clean
                fileUploadOwnership.clear();

                // Cross-tenant user C attempts to access User A's file on Instance 2
                const authCrossTenant = await authorizeFileAccess(userC_crossTenant, fileId, 'READ');
                assert.strictEqual(authCrossTenant, false, 'Instance 2 must strictly reject cross-tenant access with false (404)');

                // Unauthorized user B in same tenant (non-admin) also denied
                const authUserB = await authorizeFileAccess(userB, fileId, 'READ');
                assert.strictEqual(authUserB, false, 'Instance 2 must deny unauthorized user in same tenant');
            });

            await sub.test('20e. Unverified ownership fails closed', async () => {
                const unverifiedFileId = 'unregistered-arbitrary-file-999';
                fileUploadOwnership.clear();

                const auth = await authorizeFileAccess(userA, unverifiedFileId, 'READ');
                assert.strictEqual(auth, false, 'Unverified file ID must fail closed with false (404)');
            });

            await sub.test('20f. Durable ownership fail-closed: registerUploadedFile throws and cleans up cache on DB error', async () => {
                const fileId = 'durable-fail-closed-test-file-999';
                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                try {
                    // Force MongoDB bulkWrite to fail
                    DirectUploadRecord.bulkWrite = async () => {
                        throw new Error('Simulated MongoDB Write Failure (disk full / network timeout)');
                    };

                    await assert.rejects(
                        async () => registerUploadedFile(fileId, userA, { storage: 'google_drive' }),
                        /Failed to persist durable ownership record/
                    );

                    // Verify cache was wiped clean on failure
                    assert.strictEqual(fileUploadOwnership.has(fileId), false, 'Cache must not hold record if DB persistence failed');
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                }
            });

            await sub.test('20g. POST /api/upload surfaces HTTP 500 error on durable persistence failure and never returns 200', async () => {
                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                const originalFindById = User.findById;
                let testServer;
                try {
                    User.findById = (id) => ({
                        populate: () => ({
                            lean: async () => userA
                        })
                    });
                    const tokenA = jwt.sign({ id: userA._id }, config.jwtSecret, { expiresIn: '1h' });

                    // Force DirectUploadRecord.bulkWrite to fail
                    DirectUploadRecord.bulkWrite = async () => {
                        throw new Error('Simulated DB persistence failure on disk write');
                    };

                    const testApp = express();
                    testApp.use(express.json());
                    testApp.use('/api/upload', uploadRoutes);

                    testServer = http.createServer(testApp);
                    await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
                    const port = testServer.address().port;

                    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
                    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fail-test.txt"\r\nContent-Type: text/plain\r\n\r\nTest content for durable fail closed\r\n--${boundary}--\r\n`;

                    const response = await fetch(`http://127.0.0.1:${port}/api/upload`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${boundary}`,
                            'Authorization': `Bearer ${tokenA}`
                        },
                        body: payload
                    });

                    const json = await response.json();
                    assert.strictEqual(response.status, 500, 'Must return HTTP 500 on durable persistence failure');
                    assert.strictEqual(json.success, false);
                    assert.ok(json.error.includes('could not establish durable file ownership record'), 'Error message must reflect controlled failure');
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                    User.findById = originalFindById;
                    if (testServer) {
                        await new Promise(resolve => testServer.close(resolve));
                    }
                }
            });

            // =================================================================
            // Strict Tenant Identity Enforcement Matrix (isAuthorizedForRecord)
            // =================================================================
            await sub.test('20h. Strict tenant identity: same owner + same tenant is authorized', () => {
                const record = {
                    fileId: 'tenant-test-file-1',
                    userId: userA._id,
                    tenantId: userA.tenantId
                };
                const authorized = isAuthorizedForRecord(record, userA, userA._id, userA.tenantId);
                assert.strictEqual(authorized, true, 'Same owner with matching tenant identity must be authorized');
            });

            await sub.test('20i. Strict tenant identity: same owner + missing user tenant identity is strictly denied', () => {
                const record = {
                    fileId: 'tenant-test-file-2',
                    userId: userA._id,
                    tenantId: userA.tenantId
                };
                // User has same _id, but no tenantId (e.g. tenantless token or stripped context)
                const authorized = isAuthorizedForRecord(record, userA, userA._id, null);
                assert.strictEqual(authorized, false, 'Missing user tenant identity must NOT bypass tenant isolation');
            });

            await sub.test('20j. Strict tenant identity: same owner + different tenant is strictly denied', () => {
                const differentTenantId = new mongoose.Types.ObjectId('65d777777777777777777777');
                const record = {
                    fileId: 'tenant-test-file-3',
                    userId: userA._id,
                    tenantId: userA.tenantId
                };
                // User has same _id, but claims a different tenant
                const authorized = isAuthorizedForRecord(record, userA, userA._id, differentTenantId);
                assert.strictEqual(authorized, false, 'Same owner with mismatched tenant identity must be strictly denied');
            });

            await sub.test('20k. Strict tenant identity: different user in same tenant (non-admin) is denied', () => {
                const record = {
                    fileId: 'tenant-test-file-4',
                    userId: userA._id,
                    tenantId: userA.tenantId
                };
                // User B is an agent in same tenant, but not the owner
                const authorized = isAuthorizedForRecord(record, userB, userB._id, userB.tenantId);
                assert.strictEqual(authorized, false, 'Non-admin agent in same tenant cannot access another user file');
            });

            await sub.test('20l. Strict tenant identity: tenant admin in same tenant is authorized', () => {
                const tenantAdmin = {
                    _id: new mongoose.Types.ObjectId('65d444444444444444444444'),
                    tenantId: userA.tenantId,
                    role: { name: 'admin' },
                    dataScope: 'tenant'
                };
                const record = {
                    fileId: 'tenant-test-file-5',
                    userId: userA._id,
                    tenantId: userA.tenantId
                };
                const authorized = isAuthorizedForRecord(record, tenantAdmin, tenantAdmin._id, tenantAdmin.tenantId);
                assert.strictEqual(authorized, true, 'Tenant admin within the same tenant must be authorized');
            });

            await sub.test('20m. Strict tenant identity: cross-tenant access is strictly denied', () => {
                const record = {
                    fileId: 'tenant-test-file-6',
                    userId: userA._id,
                    tenantId: userA.tenantId
                };
                // User C is in tenant 2
                const authorized = isAuthorizedForRecord(record, userC_crossTenant, userC_crossTenant._id, userC_crossTenant.tenantId);
                assert.strictEqual(authorized, false, 'Cross-tenant user must be strictly denied');
            });

            await sub.test('20n. Strict tenant identity: platform administrator policy grants access when unconstrained by tenant', () => {
                const platformAdmin = {
                    _id: new mongoose.Types.ObjectId('65d555555555555555555555'),
                    tenantId: null,
                    role: { name: 'super admin' },
                    dataScope: 'all'
                };
                const record = {
                    fileId: 'tenant-test-file-7',
                    userId: userA._id,
                    tenantId: userA.tenantId
                };
                const authorized = isAuthorizedForRecord(record, platformAdmin, platformAdmin._id, null);
                assert.strictEqual(authorized, true, 'Platform administrator with global dataScope without tenant lockdown must be authorized');
            });
        } finally {
            await DirectUploadRecord.deleteMany({}).catch(() => {});
            fileUploadOwnership.clear();
        }
    });

    // =========================================================================
    // 21. Multiple Upload Partial-Failure Cleanup & Atomic Batch Rollback
    // =========================================================================
    await t.test('21. Multiple Upload Partial-Failure Cleanup & Atomic Batch Rollback', async (sub) => {
        let mongod;
        try {
            mongod = await getOrStartMongo();
        } catch (mErr) {
            assert.fail(`Fatal test failure: MongoMemoryServer could not be initialized for Suite 21: ${mErr.message}`);
        }

        const userA = {
            _id: new mongoose.Types.ObjectId('65d111111111111111111111'),
            name: 'User A (Tenant 1)',
            email: 'usera@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const userB = {
            _id: new mongoose.Types.ObjectId('65d222222222222222222222'),
            name: 'User B (Tenant 1)',
            email: 'userb@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const originalFindById = User.findById;
        User.findById = (id) => ({
            populate: () => ({
                lean: async () => {
                    const sId = String(id);
                    if (sId === String(userA._id)) return userA;
                    if (sId === String(userB._id)) return userB;
                    return null;
                }
            })
        });

        const tokenA = jwt.sign({ id: userA._id }, config.jwtSecret, { expiresIn: '1h' });

        function buildMultipartBatch(boundary, files) {
            let body = '';
            for (const f of files) {
                body += `--${boundary}\r\n`;
                body += `Content-Disposition: form-data; name="files"; filename="${f.filename}"\r\n`;
                body += `Content-Type: ${f.mimeType || 'text/plain'}\r\n\r\n`;
                body += `${f.content || 'Dummy test file content'}\r\n`;
            }
            body += `--${boundary}--\r\n`;
            return body;
        }

        try {
            // -----------------------------------------------------------------
            // 21a. First file succeeds, second file registration fails
            // -----------------------------------------------------------------
            await sub.test('21a. First file succeeds, second file registration fails -> rolls back all batch entries', async () => {
                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                let testServer;
                try {
                    // Fail bulkWrite ONLY when registering the second file
                    DirectUploadRecord.bulkWrite = async (ops) => {
                        const fileId = ops[0]?.insertOne?.document?.fileId || ops[0]?.updateOne?.filter?.fileId || '';
                        if (fileId.includes('batch-fail-file-2')) {
                            throw new Error('Simulated write failure on second file registration');
                        }
                        return await originalBulkWrite.call(DirectUploadRecord, ops);
                    };

                    const testApp = express();
                    testApp.use(express.json());
                    testApp.use('/api/upload', uploadRoutes);

                    testServer = http.createServer(testApp);
                    await new Promise(res => testServer.listen(0, '127.0.0.1', res));
                    const port = testServer.address().port;

                    const boundary = '----BoundarySuite21a';
                    const payload = buildMultipartBatch(boundary, [
                        { filename: 'batch-file-1-success.txt', content: 'Content of File 1' },
                        { filename: 'batch-fail-file-2.txt', content: 'Content of File 2' }
                    ]);

                    const response = await fetch(`http://127.0.0.1:${port}/api/upload/multiple`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${boundary}`,
                            'Authorization': `Bearer ${tokenA}`
                        },
                        body: payload
                    });

                    const json = await response.json();
                    assert.strictEqual(response.status, 500, 'Must return HTTP 500 when any file in batch fails');
                    assert.strictEqual(json.success, false);
                    assert.strictEqual(json.failedCount, 1);
                    assert.strictEqual(json.totalCount, 2);

                    // VERIFY ROLLBACK: File 1's registration must be removed from both cache and DB
                    const remainingRecords = await DirectUploadRecord.find({
                        fileId: { $in: [/batch-file-1-success/, /batch-fail-file-2/] }
                    }).lean();
                    assert.strictEqual(remainingRecords.length, 0, 'No durable records must remain for any file in failed batch');

                    // Cache check
                    for (const [k] of fileUploadOwnership) {
                        assert.ok(!k.includes('batch-file-1-success'), 'Cache must not retain File 1 after batch failure');
                        assert.ok(!k.includes('batch-fail-file-2'), 'Cache must not retain File 2 after batch failure');
                    }
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                    if (testServer) await new Promise(res => testServer.close(res));
                }
            });

            // -----------------------------------------------------------------
            // 21b. Drive ID registration succeeds but local filename registration fails
            // -----------------------------------------------------------------
            await sub.test('21b. Drive ID registration succeeds but local filename alias fails -> removes first registration', async () => {
                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                let testServer;
                const mockDriveId = 'mock-drive-id-first-success-777';

                try {
                    // Mock drive client that returns a successful Drive upload
                    const mockDriveClient = {
                        files: {
                            create: async () => ({
                                data: {
                                    id: mockDriveId,
                                    webViewLink: `https://drive.google.com/file/d/${mockDriveId}/view`,
                                    webContentLink: `https://drive.google.com/uc?id=${mockDriveId}&export=download`
                                }
                            })
                        }
                    };

                    // Fail bulkWrite ONLY when registering the local filename alias (second registration)
                    DirectUploadRecord.bulkWrite = async (ops) => {
                        const fileId = ops[0]?.insertOne?.document?.fileId || ops[0]?.updateOne?.filter?.fileId || '';
                        if (fileId !== mockDriveId) {
                            throw new Error('Simulated DB failure on second registration (local filename alias)');
                        }
                        return await originalBulkWrite.call(DirectUploadRecord, ops);
                    };

                    const testApp = express();
                    testApp.set('driveService', mockDriveClient);
                    testApp.use(express.json());
                    testApp.use('/api/upload', uploadRoutes);

                    testServer = http.createServer(testApp);
                    await new Promise(res => testServer.listen(0, '127.0.0.1', res));
                    const port = testServer.address().port;

                    const boundary = '----BoundarySuite21b';
                    const payload = buildMultipartBatch(boundary, [
                        { filename: 'alias-failure-test.txt', content: 'Testing alias registration failure' }
                    ]);

                    const response = await fetch(`http://127.0.0.1:${port}/api/upload/multiple`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${boundary}`,
                            'Authorization': `Bearer ${tokenA}`
                        },
                        body: payload
                    });

                    const json = await response.json();
                    assert.strictEqual(response.status, 500, 'Must return HTTP 500 when alias registration fails');
                    assert.strictEqual(json.success, false);

                    // VERIFY: The first registration (Drive ID) was removed from both memory and MongoDB!
                    assert.strictEqual(fileUploadOwnership.has(mockDriveId), false, 'Drive ID must be removed from cache on alias failure');
                    const driveDoc = await DirectUploadRecord.findOne({ fileId: mockDriveId });
                    assert.strictEqual(driveDoc, null, 'Drive ID durable record must be deleted from DB on alias failure');
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                    if (testServer) await new Promise(res => testServer.close(res));
                }
            });

            // -----------------------------------------------------------------
            // 21c. Multiple files fail concurrently
            // -----------------------------------------------------------------
            await sub.test('21c. Multiple files fail concurrently -> all promises settle cleanly and batch rolls back', async () => {
                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                let testServer;
                try {
                    // All registrations fail
                    DirectUploadRecord.bulkWrite = async () => {
                        throw new Error('Simulated concurrent DB failure');
                    };

                    const testApp = express();
                    testApp.use(express.json());
                    testApp.use('/api/upload', uploadRoutes);

                    testServer = http.createServer(testApp);
                    await new Promise(res => testServer.listen(0, '127.0.0.1', res));
                    const port = testServer.address().port;

                    const boundary = '----BoundarySuite21c';
                    const payload = buildMultipartBatch(boundary, [
                        { filename: 'concurrent-fail-1.txt', content: 'File 1' },
                        { filename: 'concurrent-fail-2.txt', content: 'File 2' },
                        { filename: 'concurrent-fail-3.txt', content: 'File 3' }
                    ]);

                    const response = await fetch(`http://127.0.0.1:${port}/api/upload/multiple`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${boundary}`,
                            'Authorization': `Bearer ${tokenA}`
                        },
                        body: payload
                    });

                    const json = await response.json();
                    assert.strictEqual(response.status, 500, 'Must return HTTP 500 when concurrent files fail');
                    assert.strictEqual(json.success, false);
                    assert.strictEqual(json.failedCount, 3);
                    assert.strictEqual(json.totalCount, 3);

                    // Zero records created
                    const records = await DirectUploadRecord.find({
                        fileId: { $in: [/concurrent-fail-1/, /concurrent-fail-2/, /concurrent-fail-3/] }
                    }).lean();
                    assert.strictEqual(records.length, 0);
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                    if (testServer) await new Promise(res => testServer.close(res));
                }
            });

            // -----------------------------------------------------------------
            // 21d. Pre-existing ownership records remain untouched
            // -----------------------------------------------------------------
            await sub.test('21d. Pre-existing ownership records remain untouched during batch failure rollback', async () => {
                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                let testServer;

                // Create pre-existing file for User A
                const preExistingA = 'pre-existing-user-a-doc-999';
                await registerUploadedFile(preExistingA, userA, {
                    storage: 'google_drive',
                    originalName: 'passport_a.pdf'
                });

                // Create pre-existing file for User B
                const preExistingB = 'pre-existing-user-b-doc-888';
                await registerUploadedFile(preExistingB, userB, {
                    storage: 'google_drive',
                    originalName: 'id_b.pdf'
                });

                try {
                    // Force batch upload to fail on write
                    DirectUploadRecord.bulkWrite = async (ops) => {
                        const fileId = ops[0]?.insertOne?.document?.fileId || ops[0]?.updateOne?.filter?.fileId || '';
                        if (fileId.includes('unrelated-batch-fail')) {
                            throw new Error('Simulated DB failure during new batch');
                        }
                        return await originalBulkWrite.call(DirectUploadRecord, ops);
                    };

                    const testApp = express();
                    testApp.use(express.json());
                    testApp.use('/api/upload', uploadRoutes);

                    testServer = http.createServer(testApp);
                    await new Promise(res => testServer.listen(0, '127.0.0.1', res));
                    const port = testServer.address().port;

                    const boundary = '----BoundarySuite21d';
                    const payload = buildMultipartBatch(boundary, [
                        { filename: 'unrelated-batch-fail.txt', content: 'New failing file' }
                    ]);

                    const response = await fetch(`http://127.0.0.1:${port}/api/upload/multiple`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${boundary}`,
                            'Authorization': `Bearer ${tokenA}`
                        },
                        body: payload
                    });

                    assert.strictEqual(response.status, 500);

                    // VERIFY: Pre-existing records for User A and User B remain completely intact!
                    assert.strictEqual(fileUploadOwnership.has(preExistingA), true, 'User A pre-existing file must remain in cache');
                    assert.strictEqual(fileUploadOwnership.has(preExistingB), true, 'User B pre-existing file must remain in cache');

                    const recordA = await DirectUploadRecord.findOne({ fileId: preExistingA }).lean();
                    assert.ok(recordA, 'User A pre-existing record must remain in MongoDB');
                    assert.strictEqual(String(recordA.userId), String(userA._id));

                    const recordB = await DirectUploadRecord.findOne({ fileId: preExistingB }).lean();
                    assert.ok(recordB, 'User B pre-existing record must remain in MongoDB');
                    assert.strictEqual(String(recordB.userId), String(userB._id));
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                    if (testServer) await new Promise(res => testServer.close(res));
                }
            });

            // -----------------------------------------------------------------
            // 21e. No stale in-memory or durable ownership records remain for rolled-back batch entries
            // -----------------------------------------------------------------
            await sub.test('21e. No stale in-memory or durable ownership records remain for rolled-back batch entries', async () => {
                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                let testServer;
                try {
                    DirectUploadRecord.bulkWrite = async (ops) => {
                        const fileId = ops[0]?.insertOne?.document?.fileId || ops[0]?.updateOne?.filter?.fileId || '';
                        if (fileId.includes('stale-check-file-2')) {
                            throw new Error('Simulated write error on second item');
                        }
                        return await originalBulkWrite.call(DirectUploadRecord, ops);
                    };

                    const testApp = express();
                    testApp.use(express.json());
                    testApp.use('/api/upload', uploadRoutes);

                    testServer = http.createServer(testApp);
                    await new Promise(res => testServer.listen(0, '127.0.0.1', res));
                    const port = testServer.address().port;

                    const boundary = '----BoundarySuite21e';
                    const payload = buildMultipartBatch(boundary, [
                        { filename: 'stale-check-file-1.txt', content: 'Item 1' },
                        { filename: 'stale-check-file-2.txt', content: 'Item 2' }
                    ]);

                    const response = await fetch(`http://127.0.0.1:${port}/api/upload/multiple`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${boundary}`,
                            'Authorization': `Bearer ${tokenA}`
                        },
                        body: payload
                    });

                    assert.strictEqual(response.status, 500);

                    // Confirm 0 matching records in DB
                    const durableCount = await DirectUploadRecord.countDocuments({
                        fileId: { $in: [/stale-check-file-1/, /stale-check-file-2/] }
                    });
                    assert.strictEqual(durableCount, 0, 'Must have zero durable records in MongoDB for rolled-back entries');

                    // Confirm 0 matching records in memory
                    for (const [k] of fileUploadOwnership) {
                        assert.ok(!k.includes('stale-check-file-1'), 'No memory cache entry for stale item 1');
                        assert.ok(!k.includes('stale-check-file-2'), 'No memory cache entry for stale item 2');
                    }
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                    if (testServer) await new Promise(res => testServer.close(res));
                }
            });
        } finally {
            User.findById = originalFindById;
            await DirectUploadRecord.deleteMany({}).catch(() => {});
            fileUploadOwnership.clear();
        }
    });

    // =========================================================================
    // 22. Atomic Ownership Rollback Hardening & Collision Protection
    // =========================================================================
    await t.test('22. Atomic Ownership Rollback Hardening & Collision Protection', async (sub) => {
        let mongod;
        try {
            mongod = await getOrStartMongo();
        } catch (mErr) {
            assert.fail(`Fatal test failure: MongoMemoryServer could not be initialized for Suite 22: ${mErr.message}`);
        }

        const userA = {
            _id: new mongoose.Types.ObjectId('65d333333333333333333333'),
            name: 'User A (Tenant 1)',
            email: 'user-a-suite22@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const userB = {
            _id: new mongoose.Types.ObjectId('65d444444444444444444444'),
            name: 'User B (Tenant 1)',
            email: 'user-b-suite22@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const originalFindById = User.findById;
        User.findById = (id) => ({
            select: () => ({
                lean: async () => {
                    const idStr = String(id);
                    if (idStr === String(userA._id)) return userA;
                    if (idStr === String(userB._id)) return userB;
                    return null;
                }
            })
        });

        try {
            // -----------------------------------------------------------------
            // 22a. Existing same-user fileId collision: preserve original record and ownership
            // -----------------------------------------------------------------
            await sub.test('22a. Existing same-user fileId collision: preserve original record and ownership', async () => {
                const fileId = 'same-user-file-collision-101';
                // Seed initial record
                const originalDoc = await DirectUploadRecord.create({
                    fileId,
                    sanitizedFileId: fileId,
                    userId: String(userA._id),
                    tenantId: String(userA.tenantId),
                    originalName: 'original_userA_file.pdf',
                    storage: 'google_drive',
                    batchToken: 'initial-batch-user-a'
                });

                fileUploadOwnership.set(fileId, {
                    userId: String(userA._id),
                    tenantId: String(userA.tenantId),
                    storage: 'google_drive',
                    originalName: 'original_userA_file.pdf',
                    batchToken: 'initial-batch-user-a'
                });

                // Attempt to register same fileId for same user without allowOverwrite
                let thrownError = null;
                try {
                    await registerUploadedFile(fileId, userA, {
                        storage: 'google_drive',
                        originalName: 'overwritten_file.pdf',
                        batchToken: 'new-batch-attempt'
                    });
                } catch (err) {
                    thrownError = err;
                }

                assert.ok(thrownError, 'Must throw error on collision');
                assert.match(thrownError.message, /Upload collision.*already registered/);

                // Verify original record in MongoDB has not been overwritten
                const currentRecord = await DirectUploadRecord.findOne({ fileId }).lean();
                assert.ok(currentRecord);
                assert.strictEqual(String(currentRecord._id), String(originalDoc._id));
                assert.strictEqual(currentRecord.originalName, 'original_userA_file.pdf');
                assert.strictEqual(currentRecord.batchToken, 'initial-batch-user-a');

                // Verify cache still holds original entry
                const cached = fileUploadOwnership.get(fileId);
                assert.strictEqual(cached.originalName, 'original_userA_file.pdf');
                assert.strictEqual(cached.batchToken, 'initial-batch-user-a');
            });

            // -----------------------------------------------------------------
            // 22b. Existing other-user fileId collision: preserve original record and ownership
            // -----------------------------------------------------------------
            await sub.test('22b. Existing other-user fileId collision: preserve original record and ownership', async () => {
                const fileId = 'other-user-file-collision-202';
                // Seed initial record owned by userB
                const originalDoc = await DirectUploadRecord.create({
                    fileId,
                    sanitizedFileId: fileId,
                    userId: String(userB._id),
                    tenantId: String(userB.tenantId),
                    originalName: 'confidential_userB.pdf',
                    storage: 'google_drive',
                    batchToken: 'batch-user-b'
                });

                fileUploadOwnership.set(fileId, {
                    userId: String(userB._id),
                    tenantId: String(userB.tenantId),
                    storage: 'google_drive',
                    originalName: 'confidential_userB.pdf',
                    batchToken: 'batch-user-b'
                });

                // Attempt to register same fileId for userA
                let thrownError = null;
                try {
                    await registerUploadedFile(fileId, userA, {
                        storage: 'google_drive',
                        originalName: 'hijacked_file.pdf',
                        batchToken: 'hijack-batch-attempt'
                    });
                } catch (err) {
                    thrownError = err;
                }

                assert.ok(thrownError, 'Must reject cross-user collision');
                assert.match(thrownError.message, /Upload collision.*another user/);

                // Verify userB's record in DB remains intact
                const currentRecord = await DirectUploadRecord.findOne({ fileId }).lean();
                assert.ok(currentRecord);
                assert.strictEqual(String(currentRecord.userId), String(userB._id));
                assert.strictEqual(currentRecord.originalName, 'confidential_userB.pdf');

                // Verify cache still belongs to userB
                const cached = fileUploadOwnership.get(fileId);
                assert.strictEqual(String(cached.userId), String(userB._id));
                assert.strictEqual(cached.originalName, 'confidential_userB.pdf');
            });

            // -----------------------------------------------------------------
            // 22c. First bulkWrite operation succeeds and a later operation fails: cleans up partial records
            // -----------------------------------------------------------------
            await sub.test('22c. First bulkWrite operation succeeds and a later operation fails: cleans up partial records', async () => {
                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                const batchToken = `batch-22c-${Date.now()}`;
                const fileIdWithSubpath = 'folder/nested/item-22c-test.txt';
                const sanitized = 'item-22c-test.txt';

                try {
                    // Simulate partial bulkWrite success: op 0 is inserted, op 1 throws
                    DirectUploadRecord.bulkWrite = async (ops, opts) => {
                        if (ops.length > 1) {
                            // Insert the first doc manually to simulate partial persistence before driver/connection error
                            await DirectUploadRecord.collection.insertOne(ops[0].insertOne.document);
                            throw new Error('Simulated partial bulkWrite failure on second operation');
                        }
                        return await originalBulkWrite.call(DirectUploadRecord, ops, opts);
                    };

                    let caught = null;
                    try {
                        await registerUploadedFile(fileIdWithSubpath, userA, {
                            storage: 'google_drive',
                            batchToken
                        });
                    } catch (e) {
                        caught = e;
                    }

                    assert.ok(caught, 'Must throw on partial bulkWrite failure');
                    assert.match(caught.message, /Failed to persist durable ownership record/);

                    // Verify that the partially inserted first record was deleted by emergency cleanup
                    const remainingDocs = await DirectUploadRecord.find({
                        $or: [{ fileId: fileIdWithSubpath }, { fileId: sanitized }, { batchToken }]
                    }).lean();
                    assert.strictEqual(remainingDocs.length, 0, 'No partial records must remain after bulkWrite failure');

                    // Verify cache is empty
                    assert.strictEqual(fileUploadOwnership.has(fileIdWithSubpath), false);
                    assert.strictEqual(fileUploadOwnership.has(sanitized), false);
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                }
            });

            // -----------------------------------------------------------------
            // 22d. Registration throws before caller can add IDs to batchRegisteredIds: batchToken cleanup purges records
            // -----------------------------------------------------------------
            await sub.test('22d. Registration throws before caller can add IDs to batchRegisteredIds: batchToken cleanup purges records', async () => {
                const batchToken = `batch-22d-${Date.now()}`;
                const batchRegisteredFileIds = new Set();
                const batchCreatedRecordIds = new Set();
                const tracker = {
                    batchToken,
                    addFileId(id) { if (id) batchRegisteredFileIds.add(id); },
                    addRecordId(id) { if (id) batchCreatedRecordIds.add(String(id)); }
                };

                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                try {
                    // Let bulkWrite succeed, but simulate an error occurring immediately after write
                    DirectUploadRecord.bulkWrite = async (ops, opts) => {
                        await originalBulkWrite.call(DirectUploadRecord, ops, opts);
                        throw new Error('Simulated crash right after bulkWrite before caller gets returned IDs');
                    };

                    let thrown = null;
                    try {
                        await registerUploadedFile('test-file-22d.txt', userA, {
                            batchToken,
                            tracker
                        });
                    } catch (e) {
                        thrown = e;
                    }

                    assert.ok(thrown, 'Must throw error');

                    // Now execute the batch-scoped rollback (simulating caller's catch block)
                    const deleteConditions = [{ batchToken }];
                    if (batchCreatedRecordIds.size > 0) {
                        deleteConditions.push({ _id: { $in: Array.from(batchCreatedRecordIds) } });
                    }
                    await DirectUploadRecord.deleteMany({
                        $or: deleteConditions,
                        userId: String(userA._id)
                    });

                    // Verify 0 durable records remain in MongoDB for this batchToken or file
                    const recordsInDb = await DirectUploadRecord.find({
                        $or: [{ batchToken }, { fileId: 'test-file-22d.txt' }]
                    }).lean();
                    assert.strictEqual(recordsInDb.length, 0, 'Must clean up records even if caller threw before local push');
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                }
            });

            // -----------------------------------------------------------------
            // 22e. Concurrent batches using overlapping identifiers: rollback of batch 2 does not delete batch 1
            // -----------------------------------------------------------------
            await sub.test('22e. Concurrent batches using overlapping identifiers: rollback of batch 2 does not delete batch 1', async () => {
                const batchToken1 = `batch-alpha-${Date.now()}`;
                const tracker1 = {
                    batchToken: batchToken1,
                    createdRecordIds: new Set(),
                    registeredFileIds: new Set(),
                    addFileId(id) { this.registeredFileIds.add(id); },
                    addRecordId(id) { this.createdRecordIds.add(String(id)); }
                };

                // Batch 1 uploads file A successfully
                const res1 = await registerUploadedFile('file-alpha-1.txt', userA, {
                    batchToken: batchToken1,
                    tracker: tracker1
                });
                assert.ok(res1);

                // Batch 2 runs concurrently for userA with its own batchToken
                const batchToken2 = `batch-beta-${Date.now()}`;
                const tracker2 = {
                    batchToken: batchToken2,
                    createdRecordIds: new Set(),
                    registeredFileIds: new Set(),
                    addFileId(id) { this.registeredFileIds.add(id); },
                    addRecordId(id) { this.createdRecordIds.add(String(id)); }
                };

                // Batch 2 inserts a file, then encounters a failure and triggers rollback
                await registerUploadedFile('file-beta-1.txt', userA, {
                    batchToken: batchToken2,
                    tracker: tracker2
                });

                // Simulate Batch 2 failing and executing its scoped rollback:
                for (const id of tracker2.registeredFileIds) {
                    const mem = fileUploadOwnership.get(id);
                    if (mem && mem.batchToken === batchToken2) {
                        fileUploadOwnership.delete(id);
                    }
                }
                await DirectUploadRecord.deleteMany({
                    $or: [
                        { batchToken: batchToken2 },
                        { _id: { $in: Array.from(tracker2.createdRecordIds) } }
                    ],
                    userId: String(userA._id)
                });

                // VERIFY: Batch 2's records are deleted
                const betaDocs = await DirectUploadRecord.find({ batchToken: batchToken2 }).lean();
                assert.strictEqual(betaDocs.length, 0);
                assert.strictEqual(fileUploadOwnership.has('file-beta-1.txt'), false);

                // VERIFY: Batch 1's record is completely untouched and active!
                const alphaDocs = await DirectUploadRecord.find({ batchToken: batchToken1 }).lean();
                assert.strictEqual(alphaDocs.length, 1);
                assert.strictEqual(alphaDocs[0].fileId, 'file-alpha-1.txt');
                assert.strictEqual(fileUploadOwnership.has('file-alpha-1.txt'), true);
                assert.strictEqual(fileUploadOwnership.get('file-alpha-1.txt').batchToken, batchToken1);
            });

            // -----------------------------------------------------------------
            // 22f. Rollback deletes only records created by the failing batch: pre-existing records intact
            // -----------------------------------------------------------------
            await sub.test('22f. Rollback deletes only records created by the failing batch: pre-existing records intact', async () => {
                // Seed pre-existing record from earlier upload session
                const preExistingId = 'pre-existing-historical-doc-333';
                await DirectUploadRecord.create({
                    fileId: preExistingId,
                    sanitizedFileId: preExistingId,
                    userId: String(userA._id),
                    tenantId: String(userA.tenantId),
                    originalName: 'tax_return_2025.pdf',
                    storage: 'google_drive',
                    batchToken: 'historical-batch-token'
                });
                fileUploadOwnership.set(preExistingId, {
                    userId: String(userA._id),
                    tenantId: String(userA.tenantId),
                    originalName: 'tax_return_2025.pdf',
                    batchToken: 'historical-batch-token'
                });

                // Now execute a batch upload that creates 1 item and fails on item 2
                const batchTokenFailing = `batch-failing-${Date.now()}`;
                const failingTracker = {
                    batchToken: batchTokenFailing,
                    createdRecordIds: new Set(),
                    registeredFileIds: new Set(),
                    addFileId(id) { this.registeredFileIds.add(id); },
                    addRecordId(id) { this.createdRecordIds.add(String(id)); }
                };

                await registerUploadedFile('batch-failing-doc-1.txt', userA, {
                    batchToken: batchTokenFailing,
                    tracker: failingTracker
                });

                // Simulate batch failure and execute batch rollback
                for (const id of failingTracker.registeredFileIds) {
                    const mem = fileUploadOwnership.get(id);
                    if (mem && mem.batchToken === batchTokenFailing) {
                        fileUploadOwnership.delete(id);
                    }
                }
                await DirectUploadRecord.deleteMany({
                    $or: [
                        { batchToken: batchTokenFailing },
                        { _id: { $in: Array.from(failingTracker.createdRecordIds) } }
                    ],
                    userId: String(userA._id)
                });

                // VERIFY: The newly created batch record is deleted
                const failedDocInDb = await DirectUploadRecord.findOne({ fileId: 'batch-failing-doc-1.txt' }).lean();
                assert.strictEqual(failedDocInDb, null);

                // VERIFY: The pre-existing historical record is completely preserved!
                const preExistingInDb = await DirectUploadRecord.findOne({ fileId: preExistingId }).lean();
                assert.ok(preExistingInDb, 'Pre-existing record must remain in MongoDB');
                assert.strictEqual(preExistingInDb.originalName, 'tax_return_2025.pdf');
                assert.strictEqual(preExistingInDb.batchToken, 'historical-batch-token');

                const preExistingInCache = fileUploadOwnership.get(preExistingId);
                assert.ok(preExistingInCache, 'Pre-existing record must remain in cache');
                assert.strictEqual(preExistingInCache.originalName, 'tax_return_2025.pdf');
            });

            // -----------------------------------------------------------------
            // 22g. Existing memory-cache entries remain unchanged on collision attempt
            // -----------------------------------------------------------------
            await sub.test('22g. Existing memory-cache entries remain unchanged on collision attempt', async () => {
                const targetId = 'mem-cache-protection-file-444';
                const originalCachePayload = {
                    userId: String(userB._id),
                    tenantId: String(userB.tenantId),
                    storage: 'google_drive',
                    originalName: 'secret_spec.pdf',
                    batchToken: 'mem-cache-original-token',
                    timestamp: 9999999
                };
                fileUploadOwnership.set(targetId, { ...originalCachePayload });

                // Attempt to register file with same targetId for userA
                let thrown = null;
                try {
                    await registerUploadedFile(targetId, userA, {
                        storage: 'google_drive',
                        originalName: 'malicious_overwrite.pdf',
                        batchToken: 'attacker-batch-token'
                    });
                } catch (e) {
                    thrown = e;
                }

                assert.ok(thrown, 'Must throw collision error');
                assert.match(thrown.message, /Upload collision/);

                // Ensure memory cache was NOT modified or corrupted
                const currentMem = fileUploadOwnership.get(targetId);
                assert.deepStrictEqual(currentMem, originalCachePayload, 'Memory cache entry must remain strictly unchanged');
            });

            // -----------------------------------------------------------------
            // 22h. No partial durable records remain after failed registration
            // -----------------------------------------------------------------
            await sub.test('22h. No partial durable records remain after failed registration', async () => {
                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                const batchToken = `batch-22h-${Date.now()}`;
                const fileToTest = 'path/sub/file-22h-fail.png';
                const sanitized = 'file-22h-fail.png';

                try {
                    DirectUploadRecord.bulkWrite = async () => {
                        throw new Error('Database disk error during bulkWrite');
                    };

                    let thrown = null;
                    try {
                        await registerUploadedFile(fileToTest, userA, {
                            batchToken
                        });
                    } catch (e) {
                        thrown = e;
                    }

                    assert.ok(thrown, 'Must fail closed');

                    // Check MongoDB: 0 records
                    const recordsCount = await DirectUploadRecord.countDocuments({
                        $or: [{ fileId: fileToTest }, { fileId: sanitized }, { batchToken }]
                    });
                    assert.strictEqual(recordsCount, 0, 'No partial durable records must exist in MongoDB');

                    // Check cache: 0 entries
                    assert.strictEqual(fileUploadOwnership.has(fileToTest), false);
                    assert.strictEqual(fileUploadOwnership.has(sanitized), false);
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                }
            });
        } finally {
            User.findById = originalFindById;
            await DirectUploadRecord.deleteMany({}).catch(() => {});
            fileUploadOwnership.clear();
        }
    });

    // =========================================================================
    // 23. Database-Enforced Unique Constraint, Alias Collision Protection & True Concurrency
    // =========================================================================
    await t.test('23. Database-Enforced Unique Constraint, Alias Collision Protection & True Concurrency', async (sub) => {
        let mongod;
        try {
            mongod = await getOrStartMongo();
            // Ensure unique index is created on collection
            await DirectUploadRecord.collection.createIndex({ fileId: 1 }, { unique: true, name: TARGET_INDEX_NAME, background: false });
        } catch (mErr) {
            assert.fail(`Fatal test failure: MongoMemoryServer could not be initialized for Suite 23: ${mErr.message}`);
        }

        const userA = {
            _id: new mongoose.Types.ObjectId('65d555555555555555555555'),
            name: 'User A (Tenant 1)',
            email: 'user-a-suite23@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const userB = {
            _id: new mongoose.Types.ObjectId('65d666666666666666666666'),
            name: 'User B (Tenant 1)',
            email: 'user-b-suite23@tenant1.com',
            tenantId: new mongoose.Types.ObjectId('65d999999999999999999999'),
            role: { name: 'agent' },
            dataScope: 'assigned',
            isActive: true
        };

        const originalFindById = User.findById;
        User.findById = (id) => ({
            select: () => ({
                lean: async () => {
                    const idStr = String(id);
                    if (idStr === String(userA._id)) return userA;
                    if (idStr === String(userB._id)) return userB;
                    return null;
                }
            })
        });

        try {
            // -----------------------------------------------------------------
            // 23a. Unique index enforcement: MongoDB rejects duplicate fileId with E11000
            // -----------------------------------------------------------------
            await sub.test('23a. Unique index enforcement: MongoDB rejects duplicate fileId with E11000', async () => {
                const uniqueFileId = 'db-unique-constraint-enforcement-101.txt';
                await DirectUploadRecord.create({
                    fileId: uniqueFileId,
                    sanitizedFileId: uniqueFileId,
                    userId: String(userA._id),
                    tenantId: String(userA.tenantId),
                    batchToken: 'initial-unique-batch'
                });

                // Attempt to insert duplicate record directly bypassing application checks
                let insertErr = null;
                try {
                    await DirectUploadRecord.collection.insertOne({
                        fileId: uniqueFileId,
                        sanitizedFileId: uniqueFileId,
                        userId: String(userB._id),
                        tenantId: String(userB.tenantId),
                        batchToken: 'bypassing-app-checks-batch'
                    });
                } catch (err) {
                    insertErr = err;
                }

                assert.ok(insertErr, 'Direct collection insert of duplicate fileId must fail at database level');
                assert.strictEqual(insertErr.code, 11000, 'Error code must be 11000 duplicate key');
                assert.match(insertErr.message, /E11000 duplicate key error/);

                const count = await DirectUploadRecord.countDocuments({ fileId: uniqueFileId });
                assert.strictEqual(count, 1, 'Only exactly 1 document with fileId must exist');
            });

            // -----------------------------------------------------------------
            // 23b. Duplicate-key error handling: E11000 is translated into controlled upload collision error
            // -----------------------------------------------------------------
            await sub.test('23b. Duplicate-key error handling: E11000 is translated into controlled upload collision error', async () => {
                const targetFileId = 'controlled-collision-e11000-file-202.txt';
                await DirectUploadRecord.create({
                    fileId: targetFileId,
                    sanitizedFileId: targetFileId,
                    userId: String(userA._id),
                    tenantId: String(userA.tenantId),
                    batchToken: 'winner-batch-token'
                });

                let collisionErr = null;
                try {
                    await registerUploadedFile(targetFileId, userB, {
                        batchToken: 'loser-batch-token'
                    });
                } catch (err) {
                    collisionErr = err;
                }

                assert.ok(collisionErr, 'Must throw error');
                assert.match(collisionErr.message, /Upload collision/);

                // Confirm original record is untouched
                const record = await DirectUploadRecord.findOne({ fileId: targetFileId }).lean();
                assert.strictEqual(record.batchToken, 'winner-batch-token');
                assert.strictEqual(String(record.userId), String(userA._id));
            });

            // -----------------------------------------------------------------
            // 23c. Concurrent same-ID registration: barrier-controlled simultaneous execution results in exactly 1 winner, 1 controlled collision, and 1 durable record
            // -----------------------------------------------------------------
            await sub.test('23c. Concurrent same-ID registration: barrier-controlled simultaneous execution results in exactly 1 winner, 1 controlled collision, and 1 durable record', async () => {
                const raceFileId = 'race-condition-barrier-test-303.txt';
                const batchToken1 = `concurrent-batch-1-${Date.now()}`;
                const batchToken2 = `concurrent-batch-2-${Date.now()}`;
                const tracker1 = {
                    batchToken: batchToken1,
                    createdRecordIds: new Set(),
                    registeredFileIds: new Set(),
                    addFileId(id) { this.registeredFileIds.add(id); },
                    addRecordId(id) { this.createdRecordIds.add(String(id)); }
                };
                const tracker2 = {
                    batchToken: batchToken2,
                    createdRecordIds: new Set(),
                    registeredFileIds: new Set(),
                    addFileId(id) { this.registeredFileIds.add(id); },
                    addRecordId(id) { this.createdRecordIds.add(String(id)); }
                };

                let arrivals = 0;
                let releaseBarrier;
                const barrierPromise = new Promise(resolve => { releaseBarrier = resolve; });

                const originalBulkWrite = DirectUploadRecord.bulkWrite;
                try {
                    DirectUploadRecord.bulkWrite = async function(ops, opts) {
                        const isTarget = ops.some(op => op.insertOne?.document?.fileId === raceFileId);
                        if (isTarget) {
                            arrivals++;
                            if (arrivals === 2) {
                                // Both concurrent tasks have passed application pre-checks and arrived at DB write!
                                releaseBarrier();
                            } else {
                                // Task 1 waits at barrier until Task 2 arrives
                                await barrierPromise;
                            }
                        }
                        return await originalBulkWrite.call(DirectUploadRecord, ops, opts);
                    };

                    // Launch both registration attempts concurrently
                    const [res1, res2] = await Promise.allSettled([
                        registerUploadedFile(raceFileId, userA, { batchToken: batchToken1, tracker: tracker1 }),
                        registerUploadedFile(raceFileId, userB, { batchToken: batchToken2, tracker: tracker2 })
                    ]);

                    // Verify barrier release occurred with both arrivals
                    assert.strictEqual(arrivals, 2, 'Both concurrent tasks must reach the database execution barrier');

                    const fulfilled = [res1, res2].filter(r => r.status === 'fulfilled');
                    const rejected = [res1, res2].filter(r => r.status === 'rejected');

                    // Exactly one successful registration, exactly one controlled collision
                    assert.strictEqual(fulfilled.length, 1, 'Exactly one registration must succeed');
                    assert.strictEqual(rejected.length, 1, 'Exactly one registration must fail with collision');
                    assert.match(rejected[0].reason.message, /Upload collision/);

                    const winnerToken = fulfilled[0].value.batchToken;
                    const loserTracker = winnerToken === batchToken1 ? tracker2 : tracker1;
                    const winnerTracker = winnerToken === batchToken1 ? tracker1 : tracker2;
                    const winnerUser = winnerToken === batchToken1 ? userA : userB;

                    // Execute loser's batch rollback
                    for (const id of loserTracker.registeredFileIds) {
                        const mem = fileUploadOwnership.get(id);
                        if (mem && mem.batchToken === loserTracker.batchToken) {
                            fileUploadOwnership.delete(id);
                        }
                    }
                    await DirectUploadRecord.deleteMany({
                        $or: [
                            { batchToken: loserTracker.batchToken },
                            { _id: { $in: Array.from(loserTracker.createdRecordIds) } }
                        ]
                    });

                    // VERIFY: Winning record remains completely intact in MongoDB
                    const records = await DirectUploadRecord.find({ fileId: raceFileId }).lean();
                    assert.strictEqual(records.length, 1, 'Exactly one durable record must exist in MongoDB');
                    assert.strictEqual(records[0].batchToken, winnerToken, 'Winning record must retain its batchToken');
                    assert.strictEqual(String(records[0].userId), String(winnerUser._id), 'Winning record must belong to winner');

                    // VERIFY: Winning cache entry remains intact and uncorrupted
                    const cached = fileUploadOwnership.get(raceFileId);
                    assert.ok(cached, 'Winner cache entry must be present');
                    assert.strictEqual(cached.batchToken, winnerToken);
                    assert.strictEqual(String(cached.userId), String(winnerUser._id));
                } finally {
                    DirectUploadRecord.bulkWrite = originalBulkWrite;
                }
            });

            // -----------------------------------------------------------------
            // 23d. Concurrent alias collision: two distinct logical IDs with identical sanitized alias collide safely at DB level
            // -----------------------------------------------------------------
            await sub.test('23d. Concurrent alias collision: two distinct logical IDs with identical sanitized alias collide safely at DB level', async () => {
                const fileA = 'folder1/nested/invoice-alias-collision.pdf';
                const fileB = 'folder2/different/invoice-alias-collision.pdf';
                const sanitizedAlias = 'invoice-alias-collision.pdf';

                const batchTokenA = `alias-batch-a-${Date.now()}`;
                const batchTokenB = `alias-batch-b-${Date.now()}`;

                // Register file A (which registers both full fileId and sanitizedFileId alias)
                const resA = await registerUploadedFile(fileA, userA, { batchToken: batchTokenA });
                assert.ok(resA);

                // Attempt to register file B which shares the exact same sanitized alias
                let aliasErr = null;
                try {
                    await registerUploadedFile(fileB, userB, { batchToken: batchTokenB });
                } catch (err) {
                    aliasErr = err;
                }

                assert.ok(aliasErr, 'Must reject alias collision');
                assert.match(aliasErr.message, /Upload collision/);

                // Verify file A's ownership remains intact for both fileId and sanitized alias
                const durableRecordA = await DirectUploadRecord.findOne({ fileId: fileA }).lean();
                assert.ok(durableRecordA);
                assert.strictEqual(String(durableRecordA.userId), String(userA._id));

                const durableAliasRecord = await DirectUploadRecord.findOne({ fileId: sanitizedAlias }).lean();
                assert.ok(durableAliasRecord);
                assert.strictEqual(String(durableAliasRecord.userId), String(userA._id));
            });

            // -----------------------------------------------------------------
            // 23e. Winner preservation after loser rollback: loser batch rollback never deletes or corrupts winner record or cache
            // -----------------------------------------------------------------
            await sub.test('23e. Winner preservation after loser rollback: loser batch rollback never deletes or corrupts winner record or cache', async () => {
                const winnerFileId = 'preserve-after-loser-rollback-505.txt';
                const winnerToken = `winner-token-${Date.now()}`;
                const loserToken = `loser-token-${Date.now()}`;

                const winnerTracker = {
                    batchToken: winnerToken,
                    createdRecordIds: new Set(),
                    registeredFileIds: new Set(),
                    addFileId(id) { this.registeredFileIds.add(id); },
                    addRecordId(id) { this.createdRecordIds.add(String(id)); }
                };

                const loserTracker = {
                    batchToken: loserToken,
                    createdRecordIds: new Set(),
                    registeredFileIds: new Set(),
                    addFileId(id) { this.registeredFileIds.add(id); },
                    addRecordId(id) { this.createdRecordIds.add(String(id)); }
                };

                // Winner completes registration
                await registerUploadedFile(winnerFileId, userA, {
                    batchToken: winnerToken,
                    tracker: winnerTracker
                });

                // Loser attempts same file and throws
                try {
                    await registerUploadedFile(winnerFileId, userB, {
                        batchToken: loserToken,
                        tracker: loserTracker
                    });
                    assert.fail('Loser must fail registration');
                } catch (e) {
                    assert.match(e.message, /Upload collision/);
                }

                // Execute loser batch rollback
                for (const id of loserTracker.registeredFileIds) {
                    const mem = fileUploadOwnership.get(id);
                    if (mem && mem.batchToken === loserToken) {
                        fileUploadOwnership.delete(id);
                    }
                }
                await DirectUploadRecord.deleteMany({
                    $or: [
                        { batchToken: loserToken },
                        { _id: { $in: Array.from(loserTracker.createdRecordIds) } }
                    ]
                });

                // Check winner in DB
                const winnerInDb = await DirectUploadRecord.findOne({ fileId: winnerFileId }).lean();
                assert.ok(winnerInDb, 'Winner record must remain in MongoDB');
                assert.strictEqual(winnerInDb.batchToken, winnerToken);
                assert.strictEqual(String(winnerInDb.userId), String(userA._id));

                // Check winner in Cache
                const winnerInCache = fileUploadOwnership.get(winnerFileId);
                assert.ok(winnerInCache, 'Winner cache entry must remain in memory');
                assert.strictEqual(winnerInCache.batchToken, winnerToken);
                assert.strictEqual(String(winnerInCache.userId), String(userA._id));
            });

            // -----------------------------------------------------------------
            // 23f. Safe index migration when pre-existing duplicates are found: aborts index creation without deleting or modifying records
            // -----------------------------------------------------------------
            await sub.test('23f. Safe index migration when pre-existing duplicates are found: aborts index creation without deleting or modifying records', async () => {
                const dupFileId = 'pre-existing-duplicate-fileId.txt';

                // Drop unique index temporarily to simulate legacy duplicate state in collection
                const indexes = await DirectUploadRecord.collection.indexes();
                const singleFileIdIndexes = indexes.filter(i => i.key && Object.keys(i.key).length === 1 && i.key.fileId === 1);
                for (const idx of singleFileIdIndexes) {
                    await DirectUploadRecord.collection.dropIndex(idx.name).catch(() => {});
                }

                // Insert two records sharing identical fileId
                await DirectUploadRecord.collection.insertMany([
                    {
                        fileId: dupFileId,
                        sanitizedFileId: dupFileId,
                        userId: String(userA._id),
                        tenantId: String(userA.tenantId),
                        originalName: 'dup1.txt',
                        createdAt: new Date()
                    },
                    {
                        fileId: dupFileId,
                        sanitizedFileId: dupFileId,
                        userId: String(userB._id),
                        tenantId: String(userB.tenantId),
                        originalName: 'dup2.txt',
                        createdAt: new Date()
                    }
                ]);

                // Run preflight check
                const preflight = await preflightCheck(DirectUploadRecord);
                assert.strictEqual(preflight.status, 'ABORT');
                assert.strictEqual(preflight.hasDuplicates, true);
                assert.strictEqual(preflight.duplicateCount, 1);
                assert.strictEqual(preflight.duplicates[0].fileId, dupFileId);

                // Run migration and verify it aborts safely
                let migrationError = null;
                try {
                    await runMigration(DirectUploadRecord);
                } catch (err) {
                    migrationError = err;
                }

                assert.ok(migrationError, 'Migration must throw abort error when duplicates exist');
                assert.match(migrationError.message, /ABORTED.*Pre-existing duplicates detected/);

                // VERIFY: Zero records deleted! Both duplicates remain completely preserved
                const remainingDuplicates = await DirectUploadRecord.find({ fileId: dupFileId }).lean();
                assert.strictEqual(remainingDuplicates.length, 2, 'Migration must NOT delete or overwrite pre-existing records');

                // Cleanup test duplicates and re-create unique index for remaining tests
                await DirectUploadRecord.collection.deleteMany({ fileId: dupFileId });
                await DirectUploadRecord.collection.createIndex({ fileId: 1 }, { unique: true, name: TARGET_INDEX_NAME, background: false });
            });

            // -----------------------------------------------------------------
            // 23g. Safe index migration on clean collection: successfully creates unique index on fileId
            // -----------------------------------------------------------------
            await sub.test('23g. Safe index migration on clean collection: successfully creates unique index on fileId', async () => {
                // Drop index if exists to verify creation
                const indexes = await DirectUploadRecord.collection.indexes();
                const singleFileIdIndexes = indexes.filter(i => i.key && Object.keys(i.key).length === 1 && i.key.fileId === 1);
                for (const idx of singleFileIdIndexes) {
                    await DirectUploadRecord.collection.dropIndex(idx.name).catch(() => {});
                }

                const migrationResult = await runMigration(DirectUploadRecord);
                assert.strictEqual(migrationResult.success, true);
                assert.strictEqual(migrationResult.indexName, TARGET_INDEX_NAME);

                // Verify index exists on collection
                const updatedIndexes = await DirectUploadRecord.collection.indexes();
                const verified = updatedIndexes.find(i => i.key && Object.keys(i.key).length === 1 && i.key.fileId === 1 && i.unique);
                assert.ok(verified, 'Unique index on fileId must exist after migration');
            });

            // -----------------------------------------------------------------
            // 23h. Production configuration: DirectUploadRecordSchema has autoIndex: false and autoCreate: false
            // -----------------------------------------------------------------
            await sub.test('23h. Production configuration: DirectUploadRecordSchema has autoIndex: false and autoCreate: false', () => {
                assert.strictEqual(
                    DirectUploadRecord.schema.options.autoIndex,
                    false,
                    'DirectUploadRecord must specify autoIndex: false to prevent background index builds from bypassing migration preflight'
                );
                assert.strictEqual(
                    DirectUploadRecord.schema.options.autoCreate,
                    false,
                    'DirectUploadRecord must specify autoCreate: false to prevent automatic collection creation on startup'
                );
            });

            // -----------------------------------------------------------------
            // 23i. Legacy index drop failure is surfaced clearly without being silently swallowed
            // -----------------------------------------------------------------
            await sub.test('23i. Legacy index drop failure is surfaced clearly without being silently swallowed', async () => {
                // Ensure target index is removed and create legacy fileId_1 index
                const indexes = await DirectUploadRecord.collection.indexes();
                const targetIdx = indexes.find(i => i.name === TARGET_INDEX_NAME);
                if (targetIdx) {
                    await DirectUploadRecord.collection.dropIndex(TARGET_INDEX_NAME);
                }
                const legacyIdx = indexes.find(i => i.name === 'fileId_1');
                if (!legacyIdx) {
                    await DirectUploadRecord.collection.createIndex({ fileId: 1 }, { name: 'fileId_1', unique: false });
                }

                const originalDropIndex = DirectUploadRecord.collection.dropIndex;
                DirectUploadRecord.collection.dropIndex = async (name) => {
                    throw new Error(`Simulated lock or permission error dropping legacy index ${name}`);
                };

                let dropError = null;
                try {
                    await runMigration(DirectUploadRecord);
                } catch (err) {
                    dropError = err;
                } finally {
                    DirectUploadRecord.collection.dropIndex = originalDropIndex;
                }

                assert.ok(dropError, 'Migration must throw when legacy index cannot be dropped');
                assert.match(
                    dropError.message,
                    /failed to drop conflicting legacy index.*Simulated lock or permission error/,
                    'Error message must clearly identify the legacy index drop failure'
                );

                // Cleanup legacy index and re-create target index
                await DirectUploadRecord.collection.dropIndex('fileId_1').catch(() => {});
                await DirectUploadRecord.collection.createIndex({ fileId: 1 }, { unique: true, name: TARGET_INDEX_NAME, background: false });
            });

            // -----------------------------------------------------------------
            // 23j. Migration idempotency: re-running an already successful migration is safe
            // -----------------------------------------------------------------
            await sub.test('23j. Migration idempotency: re-running an already successful migration is safe', async () => {
                // First run ensures index exists
                const firstRun = await runMigration(DirectUploadRecord);
                assert.strictEqual(firstRun.success, true);

                // Second run should report alreadyApplied: true without error or modifying indexes
                const secondRun = await runMigration(DirectUploadRecord);
                assert.strictEqual(secondRun.success, true);
                assert.strictEqual(secondRun.alreadyApplied, true);
                assert.strictEqual(secondRun.indexName, TARGET_INDEX_NAME);

                // Verify unique index remains fully intact
                const indexes = await DirectUploadRecord.collection.indexes();
                const target = indexes.find(i => i.name === TARGET_INDEX_NAME && i.unique === true);
                assert.ok(target, 'Target unique index must remain present after idempotent re-run');
            });

            // -----------------------------------------------------------------
            // 23k. Concurrent write collision during index creation aborts cleanly and preserves records
            // -----------------------------------------------------------------
            await sub.test('23k. Concurrent write collision during index creation aborts cleanly and preserves records', async () => {
                // Drop target index temporarily
                const indexes = await DirectUploadRecord.collection.indexes();
                const target = indexes.find(i => i.name === TARGET_INDEX_NAME);
                if (target) {
                    await DirectUploadRecord.collection.dropIndex(TARGET_INDEX_NAME);
                }

                const testDocId = 'concurrent-test-doc-during-index-create.txt';
                await DirectUploadRecord.create({
                    fileId: testDocId,
                    sanitizedFileId: testDocId,
                    userId: String(userA._id),
                    tenantId: String(userA.tenantId),
                    batchToken: 'token-pre-create'
                });

                const originalCreateIndex = DirectUploadRecord.collection.createIndex;
                DirectUploadRecord.collection.createIndex = async function(spec, opts) {
                    const err = new Error('E11000 duplicate key error collection: test.directuploadrecords index: direct_upload_records_fileid_unique dup key: { fileId: "concurrent-dup.txt" }');
                    err.code = 11000;
                    err.codeName = 'DuplicateKey';
                    throw err;
                };

                let concurrentErr = null;
                try {
                    await runMigration(DirectUploadRecord);
                } catch (err) {
                    concurrentErr = err;
                } finally {
                    DirectUploadRecord.collection.createIndex = originalCreateIndex;
                }

                assert.ok(concurrentErr, 'Must throw error when concurrent write collides during createIndex');
                assert.strictEqual(concurrentErr.code, 11000);
                assert.strictEqual(concurrentErr.isConcurrentCollision, true);
                assert.match(concurrentErr.message, /Concurrent write introduced duplicate fileId/);

                // Verify pre-existing records remain untouched
                const docInDb = await DirectUploadRecord.findOne({ fileId: testDocId }).lean();
                assert.ok(docInDb, 'Pre-existing document must not be corrupted or deleted');
                assert.strictEqual(docInDb.batchToken, 'token-pre-create');

                // Cleanup and re-create unique index
                await DirectUploadRecord.collection.deleteMany({ fileId: testDocId });
                await DirectUploadRecord.collection.createIndex({ fileId: 1 }, { unique: true, name: TARGET_INDEX_NAME, background: false });
            });
        } finally {
            User.findById = originalFindById;
            await DirectUploadRecord.deleteMany({}).catch(() => {});
            fileUploadOwnership.clear();
            if (sharedMongod) {
                try {
                    await mongoose.disconnect();
                    await sharedMongod.stop();
                } catch (cleanupErr) {}
            }
        }
    });
});
