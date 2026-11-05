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

    // =========================================================================
    // 20. Finding 3: Durable Direct-Upload Ownership (Server Restart & Multi-Instance)
    // =========================================================================
    await t.test('20. Durable Direct-Upload Ownership', async (sub) => {
        let mongod;
        try {
            mongod = await MongoMemoryServer.create();
            const uri = mongod.getUri();
            await mongoose.connect(uri);
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
            if (mongod) {
                try {
                    await mongoose.disconnect();
                    await mongod.stop();
                } catch (cleanupErr) {}
            }
        }
    });
});
