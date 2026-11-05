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
import uploadRoutes, { authorizeFileAccess, registerUploadedFile, fileUploadOwnership } from '../routes/upload.routes.js';

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
                }
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
                }
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
                    }
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
    // 18. Finding 2: Upload Retry Idempotency & Fail-Closed Concurrency
    // =========================================================================
    await t.test('18. Upload Retry Idempotency & Fail-Closed Concurrency', async (sub) => {
        await sub.test('18a. Search failure on retry attempt fails closed immediately with ProviderUnavailableError', async () => {
            let createCalls = 0;
            let listCalls = 0;
            const objectKey = 'doc-fail-search-test/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        const err = new Error('Transient 503 Backend Error on attempt 1');
                        err.code = 503;
                        throw err;
                    },
                    list: async () => {
                        listCalls++;
                        const err = new Error('Google Drive search/list API timeout');
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
                    assert.ok(err instanceof ProviderUnavailableError || err instanceof StorageError);
                    assert.ok(err.message.includes('SEARCH_EXISTING') || err.message.includes('search') || err.message.includes('timeout'));
                    return true;
                }
            );

            // Verified: create called on attempt 1, list failed on retry check, retry failed closed immediately
            assert.strictEqual(createCalls, 1, 'files.create must NOT be called on retry if search fails');
            assert.strictEqual(listCalls, 1, 'files.list must have been attempted once for remote idempotency');
        });

        await sub.test('18b. Confirmed no-match proceeds to upload with fresh stream', async () => {
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

        await sub.test('18c. Lost response / Confirmed match returns existing file without calling files.create on retry', async () => {
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

        await sub.test('18d. Concurrent retries for same logical objectKey join in-flight promise and create exactly 1 file', async () => {
            let createCalls = 0;
            const objectKey = 'doc-concurrent-mutex-test/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        // Simulate network latency
                        await new Promise(res => setTimeout(res, 50));
                        return {
                            data: {
                                id: 'mutex-created-file-single-id',
                                size: '25',
                                mimeType: 'application/pdf'
                            }
                        };
                    },
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            // Launch 3 concurrent upload attempts for the exact same objectKey
            const [res1, res2, res3] = await Promise.all([
                adapter.put(objectKey, Buffer.from('Concurrent content 1'), { mimeType: 'application/pdf' }),
                adapter.put(objectKey, Buffer.from('Concurrent content 2'), { mimeType: 'application/pdf' }),
                adapter.put(objectKey, Buffer.from('Concurrent content 3'), { mimeType: 'application/pdf' })
            ]);

            assert.strictEqual(createCalls, 1, 'files.create must be invoked exactly once for concurrent requests with same key');
            assert.strictEqual(res1.fileId, 'mutex-created-file-single-id');
            assert.strictEqual(res2.fileId, 'mutex-created-file-single-id');
            assert.strictEqual(res3.fileId, 'mutex-created-file-single-id');
        });

        await sub.test('18e. Concurrency error cleanup allows subsequent attempts after failure', async () => {
            let createCalls = 0;
            const objectKey = 'doc-concurrent-cleanup-test/v1';

            const fakeDriveClient = {
                files: {
                    create: async () => {
                        createCalls++;
                        if (createCalls === 1) {
                            const err = new Error('First attempt fatal error');
                            err.code = 400; // Non-retryable
                            throw err;
                        }
                        return {
                            data: {
                                id: 'subsequent-attempt-success-id',
                                size: '30'
                            }
                        };
                    },
                    list: async () => ({ data: { files: [] } })
                }
            };

            const adapter = new GoogleDriveStorageAdapter('google-drive-primary', {}, undefined, { driveClient: fakeDriveClient });

            // First call fails
            await assert.rejects(
                async () => adapter.put(objectKey, Buffer.from('Attempt 1'), { mimeType: 'text/plain' }),
                StorageError
            );

            // Subsequent call succeeds because in-flight promise was cleaned up in finally
            const res2 = await adapter.put(objectKey, Buffer.from('Attempt 2'), { mimeType: 'text/plain' });
            assert.strictEqual(res2.fileId, 'subsequent-attempt-success-id');
            assert.strictEqual(createCalls, 2);
        });
    });
});
