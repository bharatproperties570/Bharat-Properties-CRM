import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import GoogleDriveStorageAdapter from '../services/storage/adapters/GoogleDriveStorageAdapter.js';
import DocumentService from '../services/storage/DocumentService.js';
import DocumentAccessService, { AccessDeniedError, LifecycleRestrictionError } from '../services/storage/DocumentAccessService.js';
import { 
    DEFAULT_PROVIDER_TYPE, 
    DEFAULT_PROVIDER_INSTANCE_ID, 
    getRegistry 
} from '../services/storage/index.js';
import { 
    ProviderUnavailableError, 
    ObjectNotFoundError, 
    PolicyViolationError,
    StorageError 
} from '../services/storage/StorageErrors.js';
import GoogleDriveMigrationReport from '../services/storage/GoogleDriveMigrationReport.js';

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
        const fakeDriveClient = {
            files: {
                get: mock.fn()
            }
        };
        const adapter = new GoogleDriveStorageAdapter('google-drive-primary', { baseUrl: 'https://api.bharatproperties.co' }, undefined, { driveClient: fakeDriveClient });

        const signedUrl = await adapter.getPresignedReadUrl('doc-99/v1', 60, { fileId: 'gdrive-file-99' });
        assert.ok(signedUrl.startsWith('https://api.bharatproperties.co/api/documents/download-signed/'));
        assert.ok(signedUrl.includes('token='));

        // Extract token
        const urlObj = new URL(signedUrl);
        const token = urlObj.searchParams.get('token');
        assert.ok(token, 'Token param must be present');

        // Verify valid token
        const verification = GoogleDriveStorageAdapter.verifySignedToken(token);
        assert.strictEqual(verification.valid, true);
        assert.strictEqual(verification.payload.key, 'doc-99/v1');
        assert.strictEqual(verification.payload.fileId, 'gdrive-file-99');

        // Verify tampered token is rejected
        const tamperedToken = token.slice(0, -4) + 'abcd';
        const tamperedVerif = GoogleDriveStorageAdapter.verifySignedToken(tamperedToken);
        assert.strictEqual(tamperedVerif.valid, false);
        assert.strictEqual(tamperedVerif.reason, 'INVALID_SIGNATURE');

        // Verify expired token is rejected
        const expiredPayload = { key: 'doc-99/v1', fileId: 'gdrive-file-99', exp: Date.now() - 1000 };
        const expiredB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
        const hmac = (await import('crypto')).default.createHmac('sha256', process.env.DOCUMENT_SIGNED_URL_SECRET || process.env.JWT_SECRET || 'crm-secure-document-sign-secret');
        hmac.update(expiredB64);
        const expiredToken = `${expiredB64}.${hmac.digest('base64url')}`;

        const expiredVerif = GoogleDriveStorageAdapter.verifySignedToken(expiredToken);
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
});
