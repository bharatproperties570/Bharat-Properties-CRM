/**
 * phase17_infrastructure_hardening.test.js
 * Phase 17: Credential-Independent AWS Infrastructure Configuration & Fail-Closed Preflight Validation Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import AWSConfigValidator from '../services/infrastructure/AWSConfigValidator.js';
import BackupEncryptionVerifier from '../services/infrastructure/BackupEncryptionVerifier.js';

test('Phase 17 — AWS Infrastructure Hardening & Preflight Suite', async (t) => {

    await t.test('1. AWS Region Validation', async (t) => {
        await t.test('REG-01: Valid standard AWS regions pass validation', () => {
            const validRegions = ['eu-north-1', 'ap-south-1', 'us-east-1', 'us-west-2', 'eu-west-1', 'ca-central-1'];
            for (const r of validRegions) {
                const res = AWSConfigValidator.validateRegion(r);
                assert.strictEqual(res.valid, true, `Expected valid region for ${r}`);
                assert.strictEqual(res.region, r);
            }
        });

        await t.test('REG-02: Rejects invalid, empty, or whitespace regions', () => {
            const invalidRegions = ['', '   ', null, undefined, 123, 'eu_north_1', 'us-east', 'global', 'eu-north-1b'];
            for (const r of invalidRegions) {
                const res = AWSConfigValidator.validateRegion(r);
                assert.strictEqual(res.valid, false, `Expected invalid region for ${r}`);
                assert.ok(res.error.length > 0);
            }
        });

        await t.test('REG-03: Rejects wildcards or command injection in region', () => {
            const dangerous = ['eu-north-1*', 'eu-north-1; rm -rf', 'eu-north-1 | cat'];
            for (const d of dangerous) {
                const res = AWSConfigValidator.validateRegion(d);
                assert.strictEqual(res.valid, false);
            }
        });
    });

    await t.test('2. S3 Bucket Naming Rules Validation', async (t) => {
        await t.test('BKT-01: Valid compliant S3 bucket names pass', () => {
            const validBuckets = [
                'bharat-crm-documents-eu-north-1',
                'bharat-crm-backups-2026',
                'my-compliant-bucket-name.123',
                'app-storage-bucket'
            ];
            for (const b of validBuckets) {
                const res = AWSConfigValidator.validateBucketName(b);
                assert.strictEqual(res.valid, true, `Expected valid bucket name: ${b}`);
            }
        });

        await t.test('BKT-02: Rejects uppercase letters and underscores', () => {
            const invalidCases = ['Bharat-CRM-Bucket', 'bharat_crm_backups', 'MY_BUCKET'];
            for (const b of invalidCases) {
                const res = AWSConfigValidator.validateBucketName(b);
                assert.strictEqual(res.valid, false);
                assert.ok(res.error.includes('lowercase') || res.error.includes('underscores'));
            }
        });

        await t.test('BKT-03: Rejects length violations (< 3 or > 63 chars)', () => {
            const tooShort = 'ab';
            const tooLong = 'a'.repeat(64);
            assert.strictEqual(AWSConfigValidator.validateBucketName(tooShort).valid, false);
            assert.strictEqual(AWSConfigValidator.validateBucketName(tooLong).valid, false);
        });

        await t.test('BKT-04: Rejects IP addresses and consecutive periods', () => {
            const ipBucket = '192.168.1.1';
            const dotsBucket = 'my..bucket.com';
            assert.strictEqual(AWSConfigValidator.validateBucketName(ipBucket).valid, false);
            assert.strictEqual(AWSConfigValidator.validateBucketName(dotsBucket).valid, false);
        });
    });

    await t.test('3. KMS Key Identifier Validation', async (t) => {
        await t.test('KMS-01: Valid UUID v4 Key IDs pass', () => {
            const uuidKey = '12345678-1234-1234-1234-123456789abc';
            const res = AWSConfigValidator.validateKmsKeyIdentifier(uuidKey);
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.type, 'KEY_ID');
        });

        await t.test('KMS-02: Valid Key ARNs pass', () => {
            const keyArn = 'arn:aws:kms:eu-north-1:397633117324:key/12345678-1234-1234-1234-123456789abc';
            const res = AWSConfigValidator.validateKmsKeyIdentifier(keyArn);
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.type, 'KEY_ARN');
        });

        await t.test('KMS-03: Valid Alias names and Alias ARNs pass', () => {
            const alias = 'alias/bharat-crm-s3-key';
            const aliasArn = 'arn:aws:kms:eu-north-1:397633117324:alias/bharat-crm-s3-key';
            assert.strictEqual(AWSConfigValidator.validateKmsKeyIdentifier(alias).valid, true);
            assert.strictEqual(AWSConfigValidator.validateKmsKeyIdentifier(aliasArn).valid, true);
        });

        await t.test('KMS-04: Rejects plain strings without alias/ prefix or invalid UUIDs', () => {
            const invalid = ['my-key', 'key123', 'alias', '', null];
            for (const k of invalid) {
                const res = AWSConfigValidator.validateKmsKeyIdentifier(k);
                assert.strictEqual(res.valid, false);
            }
        });
    });

    await t.test('4. Server-Side Encryption Configuration Validation', async (t) => {
        await t.test('ENC-01: Permitted algorithms (aws:kms and AES256) pass', () => {
            const aesConfig = { algorithm: 'AES256' };
            const kmsConfig = {
                algorithm: 'aws:kms',
                kmsKeyId: '12345678-1234-1234-1234-123456789abc'
            };
            assert.strictEqual(AWSConfigValidator.validateEncryptionConfig(aesConfig).valid, true);
            assert.strictEqual(AWSConfigValidator.validateEncryptionConfig(kmsConfig).valid, true);
        });

        await t.test('ENC-02: Rejects aws:kms when kmsKeyId is missing or invalid', () => {
            const missingKey = { algorithm: 'aws:kms' };
            const invalidKey = { algorithm: 'aws:kms', kmsKeyId: 'not-a-valid-key' };
            assert.strictEqual(AWSConfigValidator.validateEncryptionConfig(missingKey).valid, false);
            assert.strictEqual(AWSConfigValidator.validateEncryptionConfig(invalidKey).valid, false);
        });

        await t.test('ENC-03: Rejects unsupported or unencrypted algorithms', () => {
            const unsupported = [{ algorithm: 'plaintext' }, { algorithm: 'DES' }, { algorithm: '' }, {}];
            for (const cfg of unsupported) {
                assert.strictEqual(AWSConfigValidator.validateEncryptionConfig(cfg).valid, false);
            }
        });
    });

    await t.test('5. Secret Redaction & Log Safety', async (t) => {
        await t.test('SEC-01: Deeply sanitizes sensitive fields in configuration objects', () => {
            const sensitiveConfig = {
                region: 'eu-north-1',
                bucket: 'bharat-crm-documents-eu-north-1',
                credentials: {
                    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                    sessionToken: 'FwoGZXIvYXdz...verylongtoken'
                },
                nested: {
                    db_password: 'supersecretpass',
                    api_key: 'AIzaSyD-12345',
                    private_cert: '-----BEGIN PRIVATE KEY-----'
                },
                safeArray: ['item1', { client_secret: 'secret123', name: 'safeName' }]
            };

            const sanitized = AWSConfigValidator.sanitizeConfigForLog(sensitiveConfig);

            // Verified preserved safe fields
            assert.strictEqual(sanitized.region, 'eu-north-1');
            assert.strictEqual(sanitized.bucket, 'bharat-crm-documents-eu-north-1');
            assert.strictEqual(sanitized.safeArray[0], 'item1');
            assert.strictEqual(sanitized.safeArray[1].name, 'safeName');

            // Verified redacted secrets
            assert.strictEqual(sanitized.credentials.accessKeyId, '[REDACTED]');
            assert.strictEqual(sanitized.credentials.secretAccessKey, '[REDACTED]');
            assert.strictEqual(sanitized.credentials.sessionToken, '[REDACTED]');
            assert.strictEqual(sanitized.nested.db_password, '[REDACTED]');
            assert.strictEqual(sanitized.nested.api_key, '[REDACTED]');
            assert.strictEqual(sanitized.nested.private_cert, '[REDACTED]');
            assert.strictEqual(sanitized.safeArray[1].client_secret, '[REDACTED]');
        });
    });

    await t.test('6. Dry-Run Environment Preflight Validation', async (t) => {
        await t.test('DRY-01: Valid compliant environment passes dry run', () => {
            const env = {
                AWS_REGION: 'eu-north-1',
                S3_BUCKET_NAME: 'bharat-crm-documents-eu-north-1',
                BACKUP_S3_BUCKET: 'bharat-crm-backups-eu-north-1',
                AWS_SSE_ALGORITHM: 'aws:kms',
                AWS_KMS_KEY_ID: 'alias/bharat-crm-s3-key',
                AWS_USE_INSTANCE_PROFILE: 'true'
            };

            const res = AWSConfigValidator.validateDryRun(env);
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.errors.length, 0);
            assert.strictEqual(res.sanitizedConfig.region, 'eu-north-1');
            assert.strictEqual(res.sanitizedConfig.credentialStrategy, 'INSTANCE_PROFILE');
        });

        await t.test('DRY-02: Missing region fails closed', () => {
            const env = {
                S3_BUCKET_NAME: 'bharat-crm-documents-eu-north-1'
            };
            const res = AWSConfigValidator.validateDryRun(env);
            assert.strictEqual(res.valid, false);
            assert.ok(res.errors.some(e => e.includes('Missing required AWS region')));
        });

        await t.test('DRY-03: Static credentials emit advisory warning', () => {
            const env = {
                AWS_REGION: 'eu-north-1',
                AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
                AWS_SECRET_ACCESS_KEY: 'secret123'
            };
            const res = AWSConfigValidator.validateDryRun(env);
            assert.strictEqual(res.valid, true);
            assert.ok(res.warnings.some(w => w.includes('Static AWS credentials detected')));
            assert.strictEqual(res.sanitizedConfig.credentialStrategy, 'STATIC_KEYS');
        });
    });

    await t.test('7. Backup Manifest & Cryptographic Integrity', async (t) => {
        await t.test('MAN-01: Verifies matching archive bytes and SHA-256 manifest', () => {
            const mockArchive = Buffer.from('TEST_MONGODB_DUMP_ARCHIVE_DATA_PAYLOAD_2026');
            const expectedSha256 = crypto.createHash('sha256').update(mockArchive).digest('hex');
            const manifest = {
                timestamp: '2026-10-29T10:00:00Z',
                archive: 'bharat-crm-backup-20261029.tar.gz',
                sha256: expectedSha256,
                size: mockArchive.length,
                status: 'VALID_LOCAL'
            };

            const res = BackupEncryptionVerifier.verifyManifestIntegrity(manifest, mockArchive);
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.errors.length, 0);
            assert.strictEqual(res.computedSha256, expectedSha256);
            assert.strictEqual(res.computedSize, mockArchive.length);
        });

        await t.test('MAN-02: Detects corrupted archive bytes or tampered manifest hash', () => {
            const originalArchive = Buffer.from('GENUINE_DATA');
            const tamperedArchive = Buffer.from('TAMPERED_DATA');
            const genuineSha256 = crypto.createHash('sha256').update(originalArchive).digest('hex');

            const manifest = {
                timestamp: '2026-10-29T10:00:00Z',
                archive: 'backup.tar.gz',
                sha256: genuineSha256,
                size: originalArchive.length,
                status: 'VALID_LOCAL'
            };

            // Test with tampered data
            const res = BackupEncryptionVerifier.verifyManifestIntegrity(manifest, tamperedArchive);
            assert.strictEqual(res.valid, false);
            assert.ok(res.errors.some(e => e.includes('SHA-256 checksum mismatch')));
        });
    });

    await t.test('8. Backup Envelope Encryption Validation', async (t) => {
        await t.test('ENV-01: Compliant AES-256-GCM envelope passes', () => {
            const validEnvelope = {
                algorithm: 'AES-256-GCM',
                keyId: 'alias/bharat-crm-backup-key',
                iv: crypto.randomBytes(12).toString('hex'), // 24 hex chars
                authTag: crypto.randomBytes(16).toString('hex'), // 32 hex chars
                encryptedAt: new Date().toISOString()
            };

            const res = BackupEncryptionVerifier.verifyEncryptionEnvelope(validEnvelope);
            assert.strictEqual(res.valid, true);
            assert.strictEqual(res.errors.length, 0);
        });

        await t.test('ENV-02: Fails closed on truncated IV or authTag', () => {
            const weakEnvelope = {
                algorithm: 'AES-256-GCM',
                keyId: 'alias/key',
                iv: 'short_iv', // < 24 chars
                authTag: 'short_tag', // < 32 chars
                encryptedAt: new Date().toISOString()
            };

            const res = BackupEncryptionVerifier.verifyEncryptionEnvelope(weakEnvelope);
            assert.strictEqual(res.valid, false);
            assert.ok(res.errors.some(e => e.includes('hexadecimal IV of at least 12 bytes')));
            assert.ok(res.errors.some(e => e.includes('authentication tag (authTag) of at least 16 bytes')));
        });
    });

    await t.test('9. KMS Customer Managed Key Rotation Compliance', async (t) => {
        await t.test('ROT-01: Compliant symmetric key with rotation enabled passes', () => {
            const compliantMetadata = {
                KeyState: 'Enabled',
                KeySpec: 'SYMMETRIC_DEFAULT',
                KeyUsage: 'ENCRYPT_DECRYPT',
                KeyRotationEnabled: true
            };

            const res = BackupEncryptionVerifier.verifyKmsKeyRotationPolicy(compliantMetadata);
            assert.strictEqual(res.compliant, true);
            assert.strictEqual(res.issues.length, 0);
        });

        await t.test('ROT-02: Non-compliant key missing rotation or in disabled state is flagged', () => {
            const nonCompliant = {
                KeyState: 'Disabled',
                KeySpec: 'RSA_2048',
                KeyUsage: 'SIGN_VERIFY',
                KeyRotationEnabled: false
            };

            const res = BackupEncryptionVerifier.verifyKmsKeyRotationPolicy(nonCompliant);
            assert.strictEqual(res.compliant, false);
            assert.strictEqual(res.issues.length, 4);
            assert.ok(res.issues.some(i => i.includes('not in Enabled state')));
            assert.ok(res.issues.some(i => i.includes('annual key rotation is NOT enabled')));
        });
    });
});
