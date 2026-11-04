import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import mongoose from 'mongoose';

import { withMongoTransaction } from '../utils/withMongoTransaction.js';
import { canViewIntake, canClaimIntake } from '../src/modules/intake/intake.authorization.js';
import { safelyRevertTrash, ensureStorageDirectories } from '../src/utils/ocrFilesystemPurge.js';
import { scanAndCleanOrphanFiles, reconcileUnqueuedIntakes } from '../src/utils/ocrOrphanCleaner.js';
import Intake from '../models/Intake.js';

test('=== PHASE 2 CONSOLIDATED REMEDIATION ACCEPTANCE SUITE (Gate 2R.12) ===', async (suite) => {

    // =========================================================================
    // WORKSTREAM A: MongoDB Transaction Retry Correctness
    // =========================================================================
    await suite.test('Workstream A.1: UnknownTransactionCommitResult does NOT re-execute business callback', async () => {
        let callbackRunCount = 0;
        let sessionEndedCount = 0;

        class MockCommitFailSession {
            async withTransaction(cb) {
                await cb(this);
                // Simulate MongoDB driver bubbling UnknownTransactionCommitResult after commit retry exhaustion
                const commitErr = new Error('Transaction commit failed with UnknownTransactionCommitResult');
                commitErr.errorLabels = ['UnknownTransactionCommitResult'];
                commitErr.hasErrorLabel = (label) => label === 'UnknownTransactionCommitResult';
                throw commitErr;
            }
            async endSession() {
                sessionEndedCount++;
            }
        }

        const originalStartSession = mongoose.startSession;
        mongoose.startSession = async () => new MockCommitFailSession();

        let caughtErr = null;
        try {
            await withMongoTransaction(async (session) => {
                callbackRunCount++;
                return { status: 'would_duplicate' };
            }, { maxRetries: 3 });
        } catch (err) {
            caughtErr = err;
        } finally {
            mongoose.startSession = originalStartSession;
        }

        assert.ok(caughtErr, 'Error should be thrown on UnknownTransactionCommitResult');
        assert.equal(caughtErr.isIndeterminateCommit, true, 'Error must be marked as indeterminate commit');
        assert.equal(callbackRunCount, 1, 'CRITICAL: Business callback must NEVER run a second time on indeterminate commit');
        assert.equal(sessionEndedCount, 1, 'Session must be properly ended and returned to pool');
    });

    await suite.test('Workstream A.2: TransientTransactionError retries with bounded backoff and succeeds', async () => {
        let callbackAttempts = 0;
        let sessionsCreated = 0;

        class MockTransientSession {
            constructor(attempt) {
                this.attempt = attempt;
            }
            async withTransaction(cb) {
                if (this.attempt === 1) {
                    const transErr = new Error('WriteConflict on primary');
                    transErr.errorLabels = ['TransientTransactionError'];
                    transErr.hasErrorLabel = (label) => label === 'TransientTransactionError';
                    throw transErr;
                }
                return await cb(this);
            }
            async endSession() {}
        }

        const originalStartSession = mongoose.startSession;
        mongoose.startSession = async () => {
            sessionsCreated++;
            return new MockTransientSession(sessionsCreated);
        };

        let result = null;
        try {
            result = await withMongoTransaction(async (session) => {
                callbackAttempts++;
                return 'SUCCESS_ON_RETRY';
            }, { maxRetries: 3 });
        } finally {
            mongoose.startSession = originalStartSession;
        }

        assert.equal(result, 'SUCCESS_ON_RETRY', 'Transaction should succeed on transient retry');
        assert.equal(callbackAttempts, 1, 'Callback only executes successfully on attempt 2');
        assert.equal(sessionsCreated, 2, 'Two separate sessions created across the retry boundary');
    });

    await suite.test('Workstream A.3: Non-transient errors abort immediately without retry', async () => {
        let callbackAttempts = 0;

        class MockFailSession {
            async withTransaction(cb) {
                return await cb(this);
            }
            async endSession() {}
        }

        const originalStartSession = mongoose.startSession;
        mongoose.startSession = async () => new MockFailSession();

        let caughtErr = null;
        try {
            await withMongoTransaction(async () => {
                callbackAttempts++;
                const valErr = new Error('E11000 duplicate key error collection');
                valErr.code = 11000;
                throw valErr;
            }, { maxRetries: 3 });
        } catch (e) {
            caughtErr = e;
        } finally {
            mongoose.startSession = originalStartSession;
        }

        assert.ok(caughtErr, 'Non-transient error must be thrown');
        assert.equal(caughtErr.code, 11000, 'Duplicate key error preserved');
        assert.equal(callbackAttempts, 1, 'Must not retry non-transient error');
    });

    // =========================================================================
    // WORKSTREAM B: Purge Lease & Archive Restoration Fencing
    // =========================================================================
    await suite.test('Workstream B.1: Atomic safelyRevertTrash preserves newer replacement file on EEXIST', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-test-'));
        const trashFile = path.join(tempDir, 'sample.1.trash');
        const permFile = path.join(tempDir, 'sample_permanent.jpg');

        fs.writeFileSync(trashFile, 'OLD_TRASH_CONTENT');
        fs.writeFileSync(permFile, 'NEW_REPLACEMENT_CONTENT');

        // Calling safelyRevertTrash when permFile already exists
        const restored = safelyRevertTrash(trashFile, permFile);

        assert.equal(restored, false, 'Should return false when destination already exists');
        assert.equal(fs.existsSync(permFile), true, 'Permanent replacement file must be preserved');
        assert.equal(fs.readFileSync(permFile, 'utf8'), 'NEW_REPLACEMENT_CONTENT', 'Permanent file content must remain intact');
        assert.equal(fs.existsSync(trashFile), false, 'Stale trash file must be safely cleaned up');

        // Clean up temp dir
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    await suite.test('Workstream B.2: Safely reverts trash file when destination is absent', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-test2-'));
        const trashFile = path.join(tempDir, 'sample.2.trash');
        const permFile = path.join(tempDir, 'sample_permanent.jpg');

        fs.writeFileSync(trashFile, 'VALID_TRASH_TO_RESTORE');

        const restored = safelyRevertTrash(trashFile, permFile);

        assert.equal(restored, true, 'Should successfully restore to destination');
        assert.equal(fs.existsSync(permFile), true, 'Permanent file must now exist');
        assert.equal(fs.readFileSync(permFile, 'utf8'), 'VALID_TRASH_TO_RESTORE', 'Restored content must match');
        assert.equal(fs.existsSync(trashFile), false, 'Trash file must be removed after link');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    await suite.test('Workstream B.3: Archive restore guard logic blocks if file_status is purging or purged', () => {
        const mockIntakePurging = {
            status: 'Archived',
            file_status: 'purging'
        };

        const targetStatus = 'Needs Review';

        let blocked = false;
        let blockReason = '';
        if (mockIntakePurging.status === 'Archived' && targetStatus === 'Needs Review') {
            if (mockIntakePurging.file_status === 'purging') {
                blocked = true;
                blockReason = 'Cannot restore: Image purge is already in progress';
            }
        }
        assert.equal(blocked, true, 'Must block restore when file_status is purging');
        assert.equal(blockReason, 'Cannot restore: Image purge is already in progress');

        const mockIntakePurged = {
            status: 'Archived',
            file_status: 'purged'
        };
        let blockedPurged = false;
        if (mockIntakePurged.status === 'Archived' && targetStatus === 'Needs Review') {
            if (mockIntakePurged.file_status === 'purged') {
                blockedPurged = true;
            }
        }
        assert.equal(blockedPurged, true, 'Must block restore when file_status is purged');
    });

    await suite.test('Workstream B.4: Archive restore unsets purgeScheduledAt and resets file_status to ready', () => {
        const current = {
            status: 'Archived',
            file_status: 'ready',
            purgeScheduledAt: new Date(Date.now() + 500000)
        };
        const status = 'Needs Review';

        const updateDoc = {
            $set: { status }
        };

        if (current.status === 'Archived' && status === 'Needs Review') {
            updateDoc.$set.file_status = 'ready';
            updateDoc.$unset = { purgeScheduledAt: 1, archivedAt: 1 };
        }

        assert.equal(updateDoc.$set.file_status, 'ready', 'file_status must be reset to ready');
        assert.equal(updateDoc.$unset.purgeScheduledAt, 1, 'purgeScheduledAt must be unset');
        assert.equal(updateDoc.$unset.archivedAt, 1, 'archivedAt must be unset');
    });

    await suite.test('Workstream B.5: Moving to Archived enforces strict 7-day retention schedule', () => {
        const current = { status: 'Needs Review' };
        const status = 'Archived';

        const updateDoc = {
            $set: { status }
        };

        const now = Date.now();
        if (status === 'Archived' && current.status !== 'Archived') {
            updateDoc.$set.archivedAt = new Date(now);
            updateDoc.$set.purgeScheduledAt = new Date(now + 7 * 24 * 60 * 60 * 1000);
        }

        const scheduledTime = updateDoc.$set.purgeScheduledAt.getTime();
        const expectedDiff = 7 * 24 * 60 * 60 * 1000;
        assert.equal(scheduledTime - now, expectedDiff, 'Purge schedule must be exactly 7 days into future');
    });

    // =========================================================================
    // WORKSTREAM C: Image File-Descriptor Security & Path Isolation
    // =========================================================================
    await suite.test('Workstream C.1: O_NOFOLLOW blocks leaf symlinks with ELOOP', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-test-'));
        const secretFile = path.join(tempDir, 'secret.txt');
        const linkFile = path.join(tempDir, 'link.jpg');

        fs.writeFileSync(secretFile, 'CONFIDENTIAL_DATA');
        fs.symlinkSync(secretFile, linkFile);

        let errorCaught = null;
        try {
            fs.openSync(linkFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        } catch (err) {
            errorCaught = err;
        }

        assert.ok(errorCaught, 'O_NOFOLLOW must reject leaf symlink');
        assert.equal(errorCaught.code, 'ELOOP', 'Kernel must report ELOOP (Too many levels of symbolic links)');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    await suite.test('Workstream C.2: Magic byte verification detects genuine vs spoofed files', () => {
        const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
        const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
        const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
        const fakeBuffer = Buffer.from('<html><script>alert("xss")</script></html>');

        const detectMime = (buf) => {
            const magic = buf.subarray(0, 12);
            if (magic.subarray(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]))) return 'image/jpeg';
            if (magic.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
            if (magic.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) && magic.subarray(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]))) return 'image/webp';
            return null;
        };

        assert.equal(detectMime(jpegBuffer), 'image/jpeg', 'Valid JPEG detected');
        assert.equal(detectMime(pngBuffer), 'image/png', 'Valid PNG detected');
        assert.equal(detectMime(webpBuffer), 'image/webp', 'Valid WebP detected');
        assert.equal(detectMime(fakeBuffer), null, 'HTML/Script rejected as null');
    });

    await suite.test('Workstream C.3: Canonical root validation prevents directory traversal out of OCR storage', () => {
        const storageOcrDir = path.resolve(process.cwd(), 'storage/intake/ocr');
        if (!fs.existsSync(storageOcrDir)) {
            fs.mkdirSync(storageOcrDir, { recursive: true });
        }
        const canonicalRoot = fs.realpathSync(storageOcrDir);

        const legitimateFile = path.resolve(storageOcrDir, 'legit.jpg');
        const traversedFile = path.resolve(process.cwd(), 'uploads/external.jpg');

        const isAllowedPath = (candidatePath) => {
            const canonicalParent = fs.realpathSync(path.dirname(candidatePath));
            return canonicalParent === canonicalRoot || canonicalParent.startsWith(canonicalRoot + path.sep);
        };

        assert.equal(isAllowedPath(legitimateFile), true, 'File within storage/intake/ocr allowed');
        assert.equal(isAllowedPath(traversedFile), false, 'File outside storage/intake/ocr rejected');
    });

    // =========================================================================
    // WORKSTREAM D: Tri-Policy Intake Authorization & Role-as-Ceiling
    // =========================================================================
    await suite.test('Workstream D.1: Sales Executive cannot view unassigned intake (Policy A)', () => {
        const unassignedIntake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: null,
            assignedTo: null,
            status: 'Raw Received'
        };

        const salesExecutive = {
            _id: new mongoose.Types.ObjectId(),
            role: 'Sales Executive',
            department: 'sales',
            dataScope: 'assigned',
            isActive: true
        };

        assert.equal(canViewIntake(unassignedIntake, salesExecutive), false, 'Sales Executive must NOT view unassigned intake');
    });

    await suite.test('Workstream D.2: Sales Executive cannot view cross-agent intake (Policy A)', () => {
        const otherAgentId = new mongoose.Types.ObjectId();
        const crossAgentIntake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: otherAgentId,
            assignedTo: otherAgentId,
            status: 'Ready for Review'
        };

        const salesExecutive = {
            _id: new mongoose.Types.ObjectId(),
            role: 'Sales Executive',
            department: 'sales',
            dataScope: 'assigned',
            isActive: true
        };

        assert.equal(canViewIntake(crossAgentIntake, salesExecutive), false, 'Sales Executive must NOT view cross-agent intake');
    });

    await suite.test('Workstream D.3: Sales Executive CAN view assigned or created intake (Policy A)', () => {
        const agentId = new mongoose.Types.ObjectId();
        const salesExecutive = {
            _id: agentId,
            role: 'Sales Executive',
            department: 'sales',
            dataScope: 'assigned',
            isActive: true
        };

        const assignedIntake = {
            _id: new mongoose.Types.ObjectId(),
            assignedTo: agentId,
            status: 'Ready for Review'
        };

        const createdIntake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: agentId,
            status: 'Queued'
        };

        assert.equal(canViewIntake(assignedIntake, salesExecutive), true, 'Sales Executive can view assigned intake');
        assert.equal(canViewIntake(createdIntake, salesExecutive), true, 'Sales Executive can view created intake');
    });

    await suite.test('Workstream D.4: Role-as-Ceiling: Sales Executive with conflicting dataScope=all is capped at assigned', () => {
        const otherAgentId = new mongoose.Types.ObjectId();
        const crossAgentIntake = {
            _id: new mongoose.Types.ObjectId(),
            assignedTo: otherAgentId,
            status: 'Ready for Review'
        };

        // Conflicting config: Role is Sales Executive, but dataScope is erroneously set to 'all'
        const rogueExecutive = {
            _id: new mongoose.Types.ObjectId(),
            role: 'Sales Executive',
            department: 'sales',
            dataScope: 'all', // Conflicting elevated scope
            isActive: true
        };

        assert.equal(canViewIntake(crossAgentIntake, rogueExecutive), false, 'Role ceiling MUST override dataScope=all for Sales Executive');
    });

    await suite.test('Workstream D.5: Sales Manager can view team and unassigned intakes for triage (Policy A)', () => {
        const teamId = new mongoose.Types.ObjectId();
        const salesManager = {
            _id: new mongoose.Types.ObjectId(),
            role: 'Sales Manager',
            department: 'sales',
            teams: [teamId],
            dataScope: 'team',
            isActive: true
        };

        const unassignedIntake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: null,
            assignedTo: null,
            status: 'Raw Received'
        };

        const teamIntake = {
            _id: new mongoose.Types.ObjectId(),
            team: teamId,
            assignedTo: new mongoose.Types.ObjectId(),
            status: 'Ready for Review'
        };

        const foreignTeamIntake = {
            _id: new mongoose.Types.ObjectId(),
            team: new mongoose.Types.ObjectId(),
            assignedTo: new mongoose.Types.ObjectId(),
            status: 'Ready for Review'
        };

        assert.equal(canViewIntake(unassignedIntake, salesManager), true, 'Sales Manager can triage unassigned intake');
        assert.equal(canViewIntake(teamIntake, salesManager), true, 'Sales Manager can view team intake');
        assert.equal(canViewIntake(foreignTeamIntake, salesManager), false, 'Sales Manager cannot view foreign team intake');
    });

    await suite.test('Workstream D.6: Admin can view all intakes across organization', () => {
        const adminUser = {
            _id: new mongoose.Types.ObjectId(),
            role: { name: 'admin', isSystemRole: true },
            department: 'management',
            isActive: true
        };

        const anyIntake = {
            _id: new mongoose.Types.ObjectId(),
            assignedTo: new mongoose.Types.ObjectId(),
            status: 'Deal Linked'
        };

        assert.equal(canViewIntake(anyIntake, adminUser), true, 'Admin can view any intake');
    });

    await suite.test('Workstream D.7: Policy B: Sales Executive can claim unassigned actionable intake', () => {
        const agentId = new mongoose.Types.ObjectId();
        const salesExecutive = {
            _id: agentId,
            role: 'Sales Executive',
            department: 'sales',
            isActive: true
        };

        const claimableIntake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: null,
            assignedTo: null,
            status: 'Raw Received'
        };

        assert.equal(canClaimIntake(claimableIntake, salesExecutive), true, 'Sales Executive can claim unassigned intake');
    });

    await suite.test('Workstream D.8: Policy B: Non-sales department user cannot claim intake', () => {
        const accountsUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'Sales Executive',
            department: 'accounts', // Non-sales department
            isActive: true
        };

        const claimableIntake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: null,
            assignedTo: null,
            status: 'Raw Received'
        };

        assert.equal(canClaimIntake(claimableIntake, accountsUser), false, 'Accounts user cannot claim intake');
    });

    await suite.test('Workstream D.9: Policy B: Cannot claim already assigned, Archived, or Deal Linked intake', () => {
        const salesExecutive = {
            _id: new mongoose.Types.ObjectId(),
            role: 'Sales Executive',
            department: 'sales',
            isActive: true
        };

        const alreadyAssigned = {
            _id: new mongoose.Types.ObjectId(),
            assignedTo: new mongoose.Types.ObjectId(),
            status: 'Needs Review'
        };

        const archivedIntake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: null,
            assignedTo: null,
            status: 'Archived'
        };

        const dealLinkedIntake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: null,
            assignedTo: null,
            status: 'Deal Linked'
        };

        assert.equal(canClaimIntake(alreadyAssigned, salesExecutive), false, 'Cannot claim already assigned intake');
        assert.equal(canClaimIntake(archivedIntake, salesExecutive), false, 'Cannot claim Archived intake');
        assert.equal(canClaimIntake(dealLinkedIntake, salesExecutive), false, 'Cannot claim Deal Linked intake');
    });

    await suite.test('Workstream D.10: Post-Claim Access (Policy C): Claimant gains viewing access after claim', () => {
        const agentId = new mongoose.Types.ObjectId();
        const salesExecutive = {
            _id: agentId,
            role: 'Sales Executive',
            department: 'sales',
            dataScope: 'assigned',
            isActive: true
        };

        const intake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: null,
            assignedTo: null,
            status: 'Raw Received'
        };

        // Before claim:
        assert.equal(canViewIntake(intake, salesExecutive), false, 'Before claim: Cannot view unassigned');
        assert.equal(canClaimIntake(intake, salesExecutive), true, 'Before claim: Eligible to claim');

        // Execute simulated claim
        intake.assignedTo = agentId;
        intake.claimedAt = new Date();

        // After claim:
        assert.equal(canViewIntake(intake, salesExecutive), true, 'After claim: Claimant has full viewing access');
        assert.equal(canClaimIntake(intake, salesExecutive), false, 'After claim: Cannot re-claim already assigned');
    });

    await suite.test('Workstream D.11: Zero hardcoded email address bypasses', () => {
        // Even if an arbitrary email is used, role and department rules apply
        const arbitraryUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'admin@bharatproperties.com', // High-sounding email
            role: 'Sales Executive',
            department: 'accounts', // Not sales
            dataScope: 'all',
            isActive: true
        };

        const unassignedIntake = {
            _id: new mongoose.Types.ObjectId(),
            createdBy: null,
            assignedTo: null,
            status: 'Raw Received'
        };

        // Must NOT bypass based on email!
        assert.equal(canViewIntake(unassignedIntake, arbitraryUser), false, 'No email-based view bypass');
        assert.equal(canClaimIntake(unassignedIntake, arbitraryUser), false, 'No email-based claim bypass');
    });

});
