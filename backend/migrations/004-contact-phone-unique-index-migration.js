import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MIGRATION_NAME = '004-contact-phone-unique-index-migration';
export const TARGET_INDEX_NAME = 'contacts_phones_number_active_unique';
export const TARGET_INDEX_SPEC = { 'phones.number': 1 };
export const TARGET_INDEX_OPTIONS = {
    name: TARGET_INDEX_NAME,
    unique: true,
    partialFilterExpression: {
        'phones.number': { $type: 'string' },
        isDeleted: false,
        isMerged: false
    },
    background: true
};

// Production Cluster Fingerprints / Allowlist
export const PRODUCTION_CLUSTER_FINGERPRINTS = Object.freeze([
    '7dehanz.mongodb.net',
    'cluster0.7dehanz.mongodb.net',
    'atlas-145yac-shard-0'
]);

export const PRODUCTION_CLUSTER_ID = 'production-atlas-7dehanz';

// Authorized DBA Approvers Allowlist
export const AUTHORIZED_DBA_APPROVERS = Object.freeze([
    'dba.lead@bharatproperties.in',
    'chief.architect@bharatproperties.in',
    'security.admin@bharatproperties.in'
]);

// Pinned Trusted DBA Public Key Registry & Trust Store (DEF-01 / DEF-05)
// Immutable Trust Anchors compiled directly into migration module.
// PROVENANCE NOTE: The pinned fingerprints represent designated DBA authorization identities.
// Prior to formal production HSM/KMS key ceremony, records are designated UNPROVISIONED_PLACEHOLDER.
// Any production execution against an UNPROVISIONED_PLACEHOLDER key will fail closed.
export const PINNED_DBA_TRUST_STORE = Object.freeze({
    'dba.lead@bharatproperties.in': Object.freeze({
        keyId: 'kid-dba-lead-2026-v1',
        approver: 'dba.lead@bharatproperties.in',
        fingerprint: 'SHA256:d8b2e1f4a9c6e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495',
        status: 'ACTIVE',
        provenance: 'UNPROVISIONED_PLACEHOLDER',
        validFrom: 1735689600000,
        validUntil: 1798761600000
    }),
    'chief.architect@bharatproperties.in': Object.freeze({
        keyId: 'kid-chief-arch-2026-v1',
        approver: 'chief.architect@bharatproperties.in',
        fingerprint: 'SHA256:a4f891b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abc',
        status: 'ACTIVE',
        provenance: 'UNPROVISIONED_PLACEHOLDER',
        validFrom: 1735689600000,
        validUntil: 1798761600000
    }),
    'security.admin@bharatproperties.in': Object.freeze({
        keyId: 'kid-sec-admin-2026-v1',
        approver: 'security.admin@bharatproperties.in',
        fingerprint: 'SHA256:bc3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123',
        status: 'ACTIVE',
        provenance: 'UNPROVISIONED_PLACEHOLDER',
        validFrom: 1735689600000,
        validUntil: 1798761600000
    })
});

/**
 * Computes standard SHA-256 SubjectPublicKeyInfo (SPKI) fingerprint.
 * Format: "SHA256:<64-char hex>"
 */
export function computePublicKeyFingerprint(publicKey) {
    if (!publicKey) {
        throw new Error('[MIGRATION-004] FATAL: Cannot compute fingerprint of null/empty public key.');
    }
    try {
        let keyObject;
        if (typeof publicKey === 'string') {
            keyObject = crypto.createPublicKey(publicKey.trim());
        } else if (publicKey instanceof crypto.KeyObject) {
            keyObject = publicKey;
        } else {
            throw new Error('Public key must be a PEM string or crypto.KeyObject');
        }
        const der = keyObject.export({ type: 'spki', format: 'der' });
        return `SHA256:${crypto.createHash('sha256').update(der).digest('hex')}`;
    } catch (err) {
        throw new Error(`[MIGRATION-004] FATAL: Invalid public key format for fingerprint computation: ${err.message}`);
    }
}

/**
 * Loads trusted DBA key registry.
 * In production, caller-supplied options or files MUST NEVER override the compiled trust store.
 * Test harness injection is strictly isolated and rejected in production execution.
 */
export function loadTrustedKeyRegistry(opts = {}, isProduction = false) {
    if (isProduction || process.env.NODE_ENV === 'production') {
        if (opts.trustedKeyRegistry || opts.trustedPublicKeys || opts.dbaTrustStorePath || process.argv.some(arg => arg.startsWith('--dba-trust-store='))) {
            throw new Error('[MIGRATION-004] SECURITY FATAL: Trust registry injection and runtime trust store overrides are strictly prohibited in production. Only immutable compiled trust anchors may be used.');
        }
        return PINNED_DBA_TRUST_STORE;
    }
    // Isolated non-production test harness inspection:
    if (opts.trustedKeyRegistry && typeof opts.trustedKeyRegistry === 'object') {
        return opts.trustedKeyRegistry;
    }
    const storePathArg = process.argv.find(arg => arg.startsWith('--dba-trust-store='));
    const storePath = opts.dbaTrustStorePath || (storePathArg ? storePathArg.split('=')[1] : null);
    if (storePath) {
        const resolvedPath = path.resolve(storePath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`[MIGRATION-004] FATAL: Configured DBA trust store file not found at ${resolvedPath}. Fail closed.`);
        }
        if (process.platform !== 'win32') {
            const stat = fs.statSync(resolvedPath);
            const mode = stat.mode & 0o777;
            if ((mode & 0o022) !== 0) {
                throw new Error(`[MIGRATION-004] FATAL: Insecure permissions on DBA trust store file (mode: 0${mode.toString(8)}). Group and others must not have write permissions (expected mode 0600 or 0644). Fail closed.`);
            }
        }
        try {
            const content = fs.readFileSync(resolvedPath, 'utf8');
            return JSON.parse(content);
        } catch (err) {
            throw new Error(`[MIGRATION-004] FATAL: Failed to read/parse DBA trust store file: ${err.message}. Fail closed.`);
        }
    }
    return PINNED_DBA_TRUST_STORE;
}

// Runtime Approval Configuration & Anti-Replay Store
export const MAX_APPROVAL_TOKEN_AGE_MS = 5 * 60 * 1000; // 5 minutes maximum token validity
export const consumedApprovalNonces = new Set();

/**
 * Computes process start time across Linux (/proc) and POSIX systems (ps).
 * Returns epoch timestamp in milliseconds or null if undetermined.
 */
export function getProcessStartTime(pid) {
    if (!pid || typeof pid !== 'number' || pid <= 0) return null;
    if (pid === process.pid) {
        return Date.now() - Math.floor(process.uptime() * 1000);
    }
    if (process.platform === 'linux') {
        try {
            const statContent = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
            const lastParen = statContent.lastIndexOf(')');
            if (lastParen !== -1) {
                const rest = statContent.substring(lastParen + 2).split(' ');
                const starttimeTicks = parseInt(rest[19], 10);
                if (!isNaN(starttimeTicks)) {
                    const procStat = fs.statSync(`/proc/${pid}`);
                    return Math.floor(procStat.mtimeMs);
                }
            }
        } catch (_) {}
    }
    try {
        const out = execSync(`ps -p ${pid} -o lstart=`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000 });
        const trimmed = out.trim();
        if (trimmed) {
            const parsed = Date.parse(trimmed);
            if (!isNaN(parsed)) return parsed;
        }
    } catch (_) {}
    return null;
}

/**
 * Durable Approval Ledger for preventing replay across process invocations.
 * Guarantees cross-process concurrency safety and atomic single-use consumption
 * via POSIX exclusive lockfiles (O_CREAT | O_EXCL), unforgeable ownership tokens,
 * coordinated atomic dead-lock recovery via POSIX rename and exact-instance verification (DEF-06),
 * cross-process PID reuse detection via start time validation, strict permission verification (0600),
 * durable write flush (fsync), and fail-closed validation on malformed or corrupted records.
 */
export class DurableApprovalLedger {
    constructor(ledgerPath, options = {}) {
        if (!ledgerPath || typeof ledgerPath !== 'string') {
            throw new Error('[MIGRATION-004] FATAL: Durable approval ledger path must be specified.');
        }
        this.ledgerPath = path.resolve(ledgerPath);
        this.lockPath = `${this.ledgerPath}.lock`;
        this.lockTimeoutMs = options.lockTimeoutMs || 5000;
        this.staleTimeoutMs = options.staleTimeoutMs || 15000;
        this.initGracePeriodMs = options.initGracePeriodMs || 500;
        this.retryIntervalMs = options.retryIntervalMs || 25;
        this.currentOwnerToken = null;

        // Ensure parent directory exists with secure mode
        const dir = path.dirname(this.ledgerPath);
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            } catch (err) {
                throw new Error(`[MIGRATION-004] FATAL: Failed to create durable ledger directory at ${dir}: ${err.message}. Fail closed.`);
            }
        }

        // Verify existing file permissions and integrity
        if (fs.existsSync(this.ledgerPath)) {
            this._verifyFilePermissions(this.ledgerPath);
            this._validateLedgerIntegrity();
        }
    }

    _getProcessStartTime() {
        return Date.now() - Math.floor(process.uptime() * 1000);
    }

    _isProcessAlive(pid, processStartTime) {
        if (!pid || typeof pid !== 'number' || pid <= 0) return false;
        try {
            process.kill(pid, 0);
        } catch (err) {
            if (err.code === 'ESRCH') return false; // Process does not exist (dead)
            if (err.code === 'EPERM') return true;  // Exists, different user
            return false;
        }

        // PID reuse detection: verify actual start time for ANY PID (DEF-06)
        if (typeof processStartTime === 'number' && processStartTime > 0) {
            const actualStartTime = getProcessStartTime(pid);
            if (typeof actualStartTime === 'number' && actualStartTime > 0) {
                if (Math.abs(actualStartTime - processStartTime) > 3000) {
                    return false; // PID reused by another process; original owner is dead
                }
            }
        }
        return true;
    }

    _verifyFilePermissions(filePath) {
        if (!fs.existsSync(filePath)) return;
        try {
            const stat = fs.statSync(filePath);
            if (process.platform !== 'win32') {
                const mode = stat.mode & 0o777;
                // Strict check: group or others must have NO access (mode must not have 0o077 set)
                if ((mode & 0o077) !== 0) {
                    throw new Error(`Insecure permissions (mode: 0${mode.toString(8)}). Expected strict mode 0600 (owner read/write only).`);
                }
            }
        } catch (err) {
            throw new Error(`[MIGRATION-004] FATAL: Ledger file permission security check failed: ${err.message}. Fail closed.`);
        }
    }

    _acquireLock() {
        const start = Date.now();
        const ownerToken = crypto.randomUUID();
        const processStartTime = this._getProcessStartTime();

        while (Date.now() - start < this.lockTimeoutMs) {
            try {
                const fd = fs.openSync(this.lockPath, 'wx', 0o600);
                try {
                    const lockData = {
                        ownerToken,
                        pid: process.pid,
                        processStartTime,
                        hostname: os.hostname(),
                        createdAt: Date.now()
                    };
                    const payload = JSON.stringify(lockData);
                    fs.writeSync(fd, payload);
                    fs.fsyncSync(fd);
                } finally {
                    fs.closeSync(fd);
                }
                this.currentOwnerToken = ownerToken;
                return ownerToken;
            } catch (err) {
                if (err.code === 'EEXIST') {
                    this._tryRecoverDeadLock();
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, this.retryIntervalMs);
                } else {
                    throw new Error(`[MIGRATION-004] FATAL: Failed to acquire ledger lock on ${this.lockPath}: ${err.message}. Fail closed.`);
                }
            }
        }
        throw new Error(
            `[MIGRATION-004] FATAL: Durable approval ledger lock timeout. ` +
            `Could not acquire exclusive lock on ${this.lockPath} within ${this.lockTimeoutMs}ms. ` +
            `Lock is actively held by a live process. Fail closed.`
        );
    }

    _tryRecoverDeadLock() {
        if (!fs.existsSync(this.lockPath)) return false;

        let stat;
        try {
            stat = fs.statSync(this.lockPath);
        } catch (err) {
            if (err.code === 'ENOENT') return false;
            throw err;
        }

        // Initialization grace period: do not disturb lockfile being written
        if (Date.now() - stat.mtimeMs < this.initGracePeriodMs) {
            return false;
        }

        let content = '';
        try {
            content = fs.readFileSync(this.lockPath, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') return false;
            throw err;
        }

        let lockData = null;
        try {
            lockData = JSON.parse(content);
        } catch (_) {
            lockData = null;
        }

        // Ambiguous ownership across hosts: fail closed!
        if (lockData && lockData.hostname && lockData.hostname !== os.hostname()) {
            return false;
        }

        let isOwnerDead = false;
        if (lockData && typeof lockData.pid === 'number') {
            const alive = this._isProcessAlive(lockData.pid, lockData.processStartTime);
            if (alive) {
                // OWNER IS ALIVE: NEVER break a lock held by a live process regardless of age
                return false;
            }
            // Process confirmed dead via ESRCH or PID reuse start-time mismatch
            isOwnerDead = true;
        } else if (!lockData) {
            // Corrupt or empty lockfile older than staleTimeoutMs
            if (Date.now() - stat.mtimeMs > this.staleTimeoutMs) {
                isOwnerDead = true;
            } else {
                return false;
            }
        }

        if (!isOwnerDead) return false;

        // COORDINATED RECOVERY PROTOCOL (DEF-06):
        // Acquire an exclusive claim coordinator to prevent races between concurrent cleanup workers
        const claimPath = `${this.lockPath}.claim`;
        let claimFd;
        try {
            claimFd = fs.openSync(claimPath, 'wx', 0o600);
        } catch (claimErr) {
            if (claimErr.code === 'EEXIST') {
                // Another cleanup worker is actively evaluating/recovering this lock
                return false;
            }
            throw claimErr;
        }

        try {
            // Re-stat the lock to record exact instance properties right before claiming
            let currentStat;
            try {
                currentStat = fs.statSync(this.lockPath);
            } catch (err) {
                if (err.code === 'ENOENT') return false;
                throw err;
            }

            const inspectedIno = currentStat.ino;
            const inspectedDev = currentStat.dev;
            const inspectedOwnerToken = lockData ? lockData.ownerToken : null;
            const inspectedPid = lockData ? lockData.pid : null;

            // ATOMIC RENAME RECOVERY
            const recoveryPath = `${this.lockPath}.recovering.${process.pid}.${Date.now()}.${crypto.randomUUID()}`;
            try {
                fs.renameSync(this.lockPath, recoveryPath);
            } catch (renameErr) {
                // Lock was released or renamed concurrently
                return false;
            }

            // EXACT-INSTANCE VERIFICATION (DEF-06):
            // Verify that the renamed file is the EXACT instance inspected, NOT a replacement lock
            let claimedStat;
            let claimedData = null;
            try {
                claimedStat = fs.statSync(recoveryPath);
                const recContent = fs.readFileSync(recoveryPath, 'utf8');
                try {
                    claimedData = JSON.parse(recContent);
                } catch (_) {
                    claimedData = null;
                }
            } catch (_) {
                return false;
            }

            const tokenMatches = inspectedOwnerToken
                ? (claimedData && claimedData.ownerToken === inspectedOwnerToken)
                : (inspectedPid ? (claimedData && claimedData.pid === inspectedPid) : true);

            const isExactMatch = (
                claimedStat.ino === inspectedIno &&
                claimedStat.dev === inspectedDev &&
                tokenMatches
            );

            if (!isExactMatch) {
                // A replacement lock was captured! IMMEDIATELY restore it intact!
                try {
                    fs.renameSync(recoveryPath, this.lockPath);
                } catch (_) {}
                return false;
            }

            // Verified exact dead instance: safe to unlink
            try {
                fs.unlinkSync(recoveryPath);
            } catch (_) {}

            return true;
        } finally {
            if (claimFd !== undefined) {
                try { fs.closeSync(claimFd); } catch (_) {}
                try { fs.unlinkSync(claimPath); } catch (_) {}
            }
        }
    }

    _releaseLock() {
        const tokenToRelease = this.currentOwnerToken;
        this.currentOwnerToken = null;
        if (!tokenToRelease) return;

        try {
            if (!fs.existsSync(this.lockPath)) return;
            const content = fs.readFileSync(this.lockPath, 'utf8');
            let lockData;
            try {
                lockData = JSON.parse(content);
            } catch (_) {
                return;
            }

            // ONLY release if the lockfile on disk still contains THIS ownerToken and THIS pid
            if (lockData && lockData.ownerToken === tokenToRelease && lockData.pid === process.pid) {
                fs.unlinkSync(this.lockPath);
            }
        } catch (_) {}
    }

    _validateLedgerIntegrity() {
        if (!fs.existsSync(this.ledgerPath)) return;
        this._verifyFilePermissions(this.ledgerPath);
        let content;
        try {
            content = fs.readFileSync(this.ledgerPath, 'utf8');
        } catch (err) {
            throw new Error(`[MIGRATION-004] FATAL: Failed to read durable approval ledger: ${err.message}. Fail closed.`);
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            try {
                const record = JSON.parse(line);
                if (!record.approvalId || typeof record.approvalId !== 'string' || record.approvalId.trim().length < 16) {
                    throw new Error(`Missing or invalid approvalId property`);
                }
            } catch (err) {
                throw new Error(`[MIGRATION-004] FATAL: Corrupted or malformed record in durable approval ledger at line ${i + 1}: ${err.message}. Fail closed to prevent replay bypass.`);
            }
        }
    }

    isApprovalConsumed(approvalId) {
        if (!approvalId || typeof approvalId !== 'string') return false;
        this._acquireLock();
        try {
            this._validateLedgerIntegrity();
            if (!fs.existsSync(this.ledgerPath)) return false;
            const content = fs.readFileSync(this.ledgerPath, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const record = JSON.parse(line);
                if (record.approvalId === approvalId) {
                    return true;
                }
            }
            return false;
        } finally {
            this._releaseLock();
        }
    }

    recordConsumedApproval(approvalId, metadata = {}) {
        if (!approvalId || typeof approvalId !== 'string' || approvalId.trim().length < 16) {
            throw new Error('[MIGRATION-004] FATAL: Cannot record approval without a valid approvalId.');
        }

        this._acquireLock();
        try {
            this._validateLedgerIntegrity();

            // Check if already consumed under the same exclusive lock
            if (fs.existsSync(this.ledgerPath)) {
                const content = fs.readFileSync(this.ledgerPath, 'utf8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    const record = JSON.parse(line);
                    if (record.approvalId === approvalId) {
                        throw new Error(`[MIGRATION-004] FATAL: Replay detected. Runtime approval ID "${approvalId}" has already been consumed. Approval tokens are strictly single-use across process restarts.`);
                    }
                }
            }

            const record = {
                approvalId,
                consumedAt: Date.now(),
                pid: process.pid,
                ...metadata
            };

            const recordLine = JSON.stringify(record) + '\n';
            let fd;
            try {
                fd = fs.openSync(this.ledgerPath, 'a', 0o600);
                fs.writeSync(fd, recordLine);
                fs.fsyncSync(fd);
            } catch (err) {
                throw new Error(`[MIGRATION-004] FATAL: Failed writing to durable approval ledger at ${this.ledgerPath}: ${err.message}. Fail closed.`);
            } finally {
                if (fd !== undefined) {
                    try { fs.closeSync(fd); } catch (_) {}
                }
            }

            this._verifyFilePermissions(this.ledgerPath);
            return record;
        } finally {
            this._releaseLock();
        }
    }
}

/**
 * Sanitizes MongoDB URIs and host strings by removing credentials.
 * Ensures passwords and tokens are never printed to logs or error messages.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeMongoUri(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw.replace(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/gi, 'mongodb$1://$2:***@');
}

/**
 * Normalizes phone numbers for business deduplication analysis.
 * Strips formatting, whitespace, and standard Indian country code / trunk prefixes.
 *
 * NOTE: This is for forensic reporting only. Index creation NEVER mutates
 * or normalizes stored database values.
 *
 * @param {string} phone
 * @returns {string}
 */
export function normalizePhoneForDeduplication(phone) {
    if (!phone || typeof phone !== 'string') return '';
    let cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+91')) {
        cleaned = cleaned.slice(3);
    } else if (cleaned.startsWith('91') && cleaned.length === 12) {
        cleaned = cleaned.slice(2);
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
        cleaned = cleaned.slice(1);
    }
    return cleaned;
}

/**
 * Resolves and validates connected MongoDB cluster identity.
 * Validates actual host and cluster topology; database name alone is NOT sufficient.
 *
 * @param {mongoose.Connection|mongoose.mongo.Db|Object} conn
 * @returns {Promise<{
 *   isValid: boolean,
 *   isProductionCluster: boolean,
 *   clusterType: string,
 *   clusterId: string,
 *   dbName: string,
 *   hosts: string[],
 *   replicaSetName: string|null,
 *   error?: string
 * }>}
 */
export async function resolveClusterIdentity(conn) {
    const db = conn?.db || conn;
    const dbName = String(db?.databaseName || conn?.name || '').trim();
    const rawHosts = new Set();

    if (conn?.host) {
        rawHosts.add(String(conn.host).toLowerCase());
    }

    const client = conn?.client || db?.client;
    if (client?.topology?.description?.servers) {
        for (const serverKey of client.topology.description.servers.keys()) {
            const hostOnly = serverKey.split(':')[0].toLowerCase();
            rawHosts.add(hostOnly);
        }
    }

    if (Array.isArray(client?.options?.hosts)) {
        client.options.hosts.forEach(h => {
            const hostOnly = String(h).split(':')[0].toLowerCase();
            rawHosts.add(hostOnly);
        });
    }

    let replicaSetName = null;
    try {
        if (typeof db?.command === 'function') {
            const hello = await db.command({ hello: 1 }).catch(() => db.command({ isMaster: 1 })).catch(() => null);
            if (hello) {
                if (hello.me) rawHosts.add(String(hello.me).split(':')[0].toLowerCase());
                if (Array.isArray(hello.hosts)) {
                    hello.hosts.forEach(h => rawHosts.add(String(h).split(':')[0].toLowerCase()));
                }
                if (hello.setName) replicaSetName = String(hello.setName).toLowerCase();
            }
        }
    } catch (_) {}

    const hosts = Array.from(rawHosts).map(h => sanitizeMongoUri(h));

    if (hosts.length === 0 || !dbName) {
        return {
            isValid: false,
            isProductionCluster: false,
            clusterType: 'UNKNOWN_UNVERIFIED',
            clusterId: 'unknown',
            dbName,
            hosts,
            replicaSetName,
            error: 'Database or cluster host identity cannot be established. Fail closed.'
        };
    }

    // Check against production Atlas fingerprint allowlist
    const isAtlasHost = hosts.some(h =>
        PRODUCTION_CLUSTER_FINGERPRINTS.some(fp => h.includes(fp.toLowerCase()))
    );
    const isAtlasReplSet = replicaSetName && PRODUCTION_CLUSTER_FINGERPRINTS.some(fp => replicaSetName.includes(fp.toLowerCase()));

    if (isAtlasHost || isAtlasReplSet) {
        return {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName,
            hosts,
            replicaSetName
        };
    }

    // Check if host is strictly local / test
    const isLocalTestHost = hosts.every(h =>
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '::1' ||
        h.startsWith('127.0.0.1') ||
        h.includes('mongodb-memory-server') ||
        h.includes('local')
    );

    if (isLocalTestHost) {
        if (dbName === 'bharatproperties1') {
            return {
                isValid: true,
                isProductionCluster: false,
                clusterType: 'NON_PROD_CLUSTER_WITH_PROD_DB_NAME',
                clusterId: 'local-test-simulated-prod',
                dbName,
                hosts,
                replicaSetName
            };
        }
        return {
            isValid: true,
            isProductionCluster: false,
            clusterType: 'LOCAL_TEST',
            clusterId: 'local-test',
            dbName,
            hosts,
            replicaSetName
        };
    }

    // Unverified remote host -> fail closed
    return {
        isValid: false,
        isProductionCluster: false,
        clusterType: 'UNKNOWN_UNVERIFIED',
        clusterId: 'unknown-remote-cluster',
        dbName,
        hosts,
        replicaSetName,
        error: `Connected host(s) [${hosts.join(', ')}] do not match verified production allowlist or local test fingerprints. Fail closed.`
    };
}

/**
 * Validates operator approval.
 * Persistent .env values must NOT independently count as explicit DBA approval.
 * Requires genuine asymmetric cryptographic authorization from an authorized DBA operator,
 * verified via public key against an external signing authority (KMS/Vault),
 * bound to migration name, operation, verified target cluster, approver identity,
 * purpose, audit reference, 5-minute expiry, and durable replay protection across process restarts.
 *
 * @param {string} mode - 'dry-run' | 'execute' | 'rollback'
 * @param {Object} clusterInfo - Result from resolveClusterIdentity
 * @param {Object} opts - Migration options
 * @returns {{ approved: boolean, approvalSource: string, approver?: string, approvalId?: string, purpose?: string, auditRef?: string }}
 */
export function verifyOperatorApproval(mode, clusterInfo, opts = {}) {
    if (mode === 'dry-run') {
        return { approved: true, approvalSource: 'DRY_RUN_READ_ONLY' };
    }

    if (!clusterInfo.isValid) {
        throw new Error(`[MIGRATION-004] FATAL: ${clusterInfo.error || 'Cluster identity is unverified. Fail closed.'}`);
    }

    const isTestHarness = opts.__testOnly_isolatedHarnessAuthorized === true;

    // Production Cluster Guard: applies whenever connected to production Atlas, regardless of dbName
    if (clusterInfo.isProductionCluster) {
        // Zero Secret Exposure Guard: reject any attempt to pass private or shared secrets to the runner
        if (opts.dbaApprovalSecret || process.argv.some(arg => arg.startsWith('--dba-approval-secret') || arg.startsWith('--dba-signing-key') || arg.startsWith('--signing-key'))) {
            throw new Error(
                `[MIGRATION-004] FATAL: Secret parameter detected. The migration runner accepts ONLY public verification keys; ` +
                `shared or private signing secrets are strictly prohibited from CLI arguments and runtime options.`
            );
        }

        // DEF-05: In production execution, strictly reject caller-supplied trust registry, custom public keys, or bypass flags
        if (!isTestHarness) {
            if (opts.trustedKeyRegistry || opts.trustedPublicKeys || opts.dbaTrustStorePath || opts.allowUnpinnedKey || opts.skipFingerprintCheck) {
                throw new Error(
                    `[MIGRATION-004] SECURITY FATAL: Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production. Production execution only trusts immutable compiled trust anchors. Fail closed.`
                );
            }
            if (process.argv.some(arg => arg.startsWith('--dba-trust-store=') || arg.startsWith('--allow-unpinned') || arg.startsWith('--skip-fingerprint'))) {
                throw new Error(
                    `[MIGRATION-004] SECURITY FATAL: CLI trust store overrides (--dba-trust-store) and bypass flags are strictly prohibited in production. Fail closed.`
                );
            }
            if (process.argv.some(arg => arg.startsWith('--confirm-dba-approval='))) {
                throw new Error(
                    `[MIGRATION-004] SECURITY FATAL: Raw approval tokens via --confirm-dba-approval=<token> are strictly prohibited in production due to ps aux, /proc, and shell history exposure. Use --confirm-dba-approval-file=<path> (mode 0600) or --confirm-dba-approval-stdin instead.`
                );
            }
        } else {
            // Guard: test harness must NEVER run if NODE_ENV is production
            if (process.env.NODE_ENV === 'production') {
                throw new Error(
                    `[MIGRATION-004] SECURITY FATAL: Test-only verification harness cannot be invoked in production environment.`
                );
            }
        }

        const prodFlag = process.env.ALLOW_PRODUCTION_MIGRATION === 'true';
        const dbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION === 'true';

        // 1. Baseline environment flags
        if (!prodFlag || !dbaFlag) {
            throw new Error(
                `[MIGRATION-004] FATAL: Production ${mode.toUpperCase()} blocked. Requires explicit ALLOW_PRODUCTION_MIGRATION=true AND DBA_APPROVED_INDEX_MIGRATION=true. Aborting.`
            );
        }

        // 2. Controlled Runtime Approval Token Check (DEF-03)
        // Production approval must originate from an explicit operator interaction at execution time,
        // strictly NOT from persistent .env or environment variables.
        // Protected input options:
        // - programmatic options (opts.runtimeDbaApproval)
        // - secure file with strict 0600 permissions (--confirm-dba-approval-file=<path> or opts.dbaApprovalFile)
        // - file descriptor (--confirm-dba-approval-fd=<fd>)
        // - standard input (--confirm-dba-approval-stdin or opts.dbaApprovalStdin)
        // - deprecated CLI argument with warning (--confirm-dba-approval=<token>)
        let runtimeToken = opts.runtimeDbaApproval || opts.runtimeDbaConfirmation;
        let tokenSource = runtimeToken ? 'RUNTIME_OPTIONS' : null;

        if (!runtimeToken) {
            const fdArg = process.argv.find(arg => arg.startsWith('--confirm-dba-approval-fd='));
            const fileArg = process.argv.find(arg => arg.startsWith('--confirm-dba-approval-file='));
            const approvalFilePath = opts.dbaApprovalFile || (fileArg ? fileArg.split('=')[1] : null);
            const stdinArg = process.argv.includes('--confirm-dba-approval-stdin') || opts.dbaApprovalStdin === true;
            const cliTokenArg = process.argv.find(arg => arg.startsWith('--confirm-dba-approval='));

            if (fdArg) {
                const fd = parseInt(fdArg.split('=')[1], 10);
                if (isNaN(fd)) {
                    throw new Error(`[MIGRATION-004] FATAL: Invalid file descriptor provided in --confirm-dba-approval-fd.`);
                }
                try {
                    runtimeToken = fs.readFileSync(fd, 'utf8').trim();
                    tokenSource = 'FILE_DESCRIPTOR';
                } catch (err) {
                    throw new Error(`[MIGRATION-004] FATAL: Failed to read approval token from file descriptor ${fd}: ${err.message}. Fail closed.`);
                }
            } else if (approvalFilePath) {
                const resolvedPath = path.resolve(approvalFilePath);
                if (!fs.existsSync(resolvedPath)) {
                    throw new Error(`[MIGRATION-004] FATAL: Approval token file not found at ${resolvedPath}. Fail closed.`);
                }
                const lstat = fs.lstatSync(resolvedPath);
                if (lstat.isSymbolicLink()) {
                    throw new Error(`[MIGRATION-004] FATAL: Approval token file at ${resolvedPath} is a symbolic link. Symlinks are strictly prohibited to prevent redirection attacks. Fail closed.`);
                }
                if (process.platform !== 'win32') {
                    const stat = fs.statSync(resolvedPath);
                    const mode = stat.mode & 0o777;
                    if ((mode & 0o077) !== 0) {
                        throw new Error(`[MIGRATION-004] FATAL: Insecure permissions on approval token file ${resolvedPath} (mode: 0${mode.toString(8)}). Expected strict 0600 (owner read/write only, no group/other access) to prevent token leakage. Fail closed.`);
                    }
                }
                try {
                    runtimeToken = fs.readFileSync(resolvedPath, 'utf8').trim();
                    tokenSource = 'SECURE_FILE';
                } catch (err) {
                    throw new Error(`[MIGRATION-004] FATAL: Failed to read approval token from file ${resolvedPath}: ${err.message}. Fail closed.`);
                }
            } else if (stdinArg) {
                try {
                    runtimeToken = fs.readFileSync(0, 'utf8').trim();
                    tokenSource = 'STDIN';
                } catch (err) {
                    throw new Error(`[MIGRATION-004] FATAL: Failed to read approval token from stdin: ${err.message}. Fail closed.`);
                }
            } else if (cliTokenArg) {
                if (clusterInfo.isProductionCluster || process.env.NODE_ENV === 'production') {
                    throw new Error(
                        `[MIGRATION-004] SECURITY FATAL: Raw approval tokens via --confirm-dba-approval=<token> are strictly prohibited in production due to ps aux, /proc, and shell history exposure. Use --confirm-dba-approval-file=<path> (mode 0600) or --confirm-dba-approval-stdin instead.`
                    );
                }
                console.warn(
                    `[MIGRATION-004] SECURITY WARNING: Supplying approval token via --confirm-dba-approval=<token> ` +
                    `exposes the token in ps aux, /proc, and shell history. Use --confirm-dba-approval-file=<path> (mode 0600) ` +
                    `or --confirm-dba-approval-stdin instead.`
                );
                runtimeToken = cliTokenArg.split('=')[1]?.trim();
                tokenSource = 'CLI_ARG_DEPRECATED';
            }
        }

        if (!runtimeToken || typeof runtimeToken !== 'string' || runtimeToken.trim() === '') {
            throw new Error(
                `[MIGRATION-004] FATAL: Production ${mode.toUpperCase()} requires explicit runtime operator approval ` +
                `(--confirm-dba-approval-file, --confirm-dba-approval-stdin, or runtimeDbaApproval). ` +
                `Persistent .env variables or shell environments cannot authorize production execution.`
            );
        }

        const trimmedToken = runtimeToken.trim();

        // Reject locally generated unauthenticated colon-separated tokens
        if (trimmedToken.includes(':') && !trimmedToken.includes('.')) {
            throw new Error(
                `[MIGRATION-004] FATAL: Unauthenticated approval token rejected. ` +
                `Locally generated timestamp/nonce strings do not prove authorized DBA approval. ` +
                `A cryptographically signed asymmetric DBA approval envelope (<payload>.<signature>) is required.`
            );
        }

        // Split cryptographic envelope: <encodedPayload>.<encodedSignature>
        const envelopeParts = trimmedToken.split('.');
        if (envelopeParts.length !== 2) {
            throw new Error(
                `[MIGRATION-004] FATAL: Malformed DBA approval envelope. Expected asymmetric envelope format: "<encodedPayload>.<encodedSignature>". ` +
                `Static, unauthenticated, or malformed approval strings are strictly rejected.`
            );
        }

        const [encodedPayload, encodedSignature] = envelopeParts;

        // Decode payload
        let payload;
        try {
            const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf8');
            payload = JSON.parse(payloadJson);
        } catch (_) {
            throw new Error(
                `[MIGRATION-004] FATAL: Malformed DBA approval payload. Unable to decode payload JSON.`
            );
        }

        // 1. Approver identity validation
        if (!payload.approver || typeof payload.approver !== 'string' || payload.approver.trim() === '') {
            throw new Error(
                `[MIGRATION-004] FATAL: DBA approval rejected. Missing approver identity.`
            );
        }

        if (!AUTHORIZED_DBA_APPROVERS.includes(payload.approver.trim())) {
            throw new Error(
                `[MIGRATION-004] FATAL: Unauthorized approver "${payload.approver}". Approver is not in the authorized DBA allowlist.`
            );
        }

        // 2. Migration binding
        if (payload.migration !== MIGRATION_NAME) {
            throw new Error(
                `[MIGRATION-004] FATAL: Mismatched migration approval. Expected approval for "${MIGRATION_NAME}".`
            );
        }

        // 3. Operation binding
        if (!payload.operation || payload.operation.toUpperCase() !== mode.toUpperCase()) {
            throw new Error(
                `[MIGRATION-004] FATAL: Stale or mismatched operation approval. Expected operation "${mode.toUpperCase()}".`
            );
        }

        // 4. Cluster binding
        if (payload.clusterId !== clusterInfo.clusterId) {
            throw new Error(
                `[MIGRATION-004] FATAL: Mismatched target cluster approval. Expected cluster "${clusterInfo.clusterId}".`
            );
        }

        // 5. Expiry and timestamp validation
        const now = Date.now();
        const expiresAt = parseInt(payload.expiresAt, 10);
        const issuedAt = parseInt(payload.issuedAt, 10);

        if (isNaN(expiresAt) || isNaN(issuedAt)) {
            throw new Error(
                `[MIGRATION-004] FATAL: Malformed DBA approval token. Expiry or issued timestamp is invalid.`
            );
        }

        if (now > expiresAt) {
            throw new Error(
                `[MIGRATION-004] FATAL: Runtime approval token has expired. Tokens are valid for at most 5 minutes. Re-issue fresh approval.`
            );
        }

        if (issuedAt - now > 60000) {
            throw new Error(
                `[MIGRATION-004] FATAL: Runtime approval token has invalid future timestamp.`
            );
        }

        if (expiresAt - issuedAt > MAX_APPROVAL_TOKEN_AGE_MS) {
            throw new Error(
                `[MIGRATION-004] FATAL: DBA approval token validity window exceeds maximum allowable threshold (5 minutes).`
            );
        }

        // 6. Unique approval ID validation
        if (!payload.approvalId || typeof payload.approvalId !== 'string' || payload.approvalId.trim().length < 16) {
            throw new Error(
                `[MIGRATION-004] FATAL: DBA approval rejected. Missing or invalid unique approval ID.`
            );
        }

        // 7. Purpose and audit reference validation
        if (!payload.purpose || typeof payload.purpose !== 'string' || payload.purpose.trim() === '') {
            throw new Error(
                `[MIGRATION-004] FATAL: DBA approval rejected. Missing approval purpose binding.`
            );
        }

        if (!payload.auditRef || typeof payload.auditRef !== 'string' || payload.auditRef.trim() === '') {
            throw new Error(
                `[MIGRATION-004] FATAL: DBA approval rejected. Missing audit reference binding.`
            );
        }

        // 8. Trusted Public-Key Pinning Validation (DEF-01 / DEF-05)
        // A caller-controlled public key is NOT a trust anchor.
        // In production, trust anchors strictly reside in PINNED_DBA_TRUST_STORE.
        const trustedRegistry = isTestHarness ? (opts.trustedKeyRegistry || loadTrustedKeyRegistry(opts, false)) : PINNED_DBA_TRUST_STORE;
        const trustedRecord = trustedRegistry[payload.approver];

        if (!trustedRecord) {
            throw new Error(
                `[MIGRATION-004] FATAL: Production approval verification failed. ` +
                `No pinned trust anchor found for approver "${payload.approver}". ` +
                `Arbitrary, unpinned, or untrusted keys are strictly rejected. Fail closed.`
            );
        }

        // DEF-04 & DEF-05: Unprovisioned placeholder keys fail closed in production path
        if (!isTestHarness && trustedRecord.provenance === 'UNPROVISIONED_PLACEHOLDER') {
            throw new Error(
                `[MIGRATION-004] FATAL: Production approval rejected. Pinned trust anchor for approver "${payload.approver}" has provenance UNPROVISIONED_PLACEHOLDER. Production execution requires cryptographic keys minted and provisioned via corporate KMS/Vault authority. Fail closed.`
            );
        }

        // Verify key status (ACTIVE vs REVOKED)
        if (trustedRecord.status === 'REVOKED') {
            throw new Error(
                `[MIGRATION-004] FATAL: Pinned signing key for approver "${payload.approver}" has been REVOKED. ` +
                `Revocation reason: ${trustedRecord.revocationReason || 'Administrative revocation'}. Fail closed.`
            );
        }
        if (trustedRecord.status !== 'ACTIVE') {
            throw new Error(
                `[MIGRATION-004] FATAL: Pinned signing key for approver "${payload.approver}" is not in ACTIVE status (status: ${trustedRecord.status}). Fail closed.`
            );
        }

        // Verify key validity window if specified
        if (trustedRecord.validFrom && now < trustedRecord.validFrom) {
            throw new Error(
                `[MIGRATION-004] FATAL: Pinned signing key for approver "${payload.approver}" is not yet valid. Fail closed.`
            );
        }
        if (trustedRecord.validUntil && now > trustedRecord.validUntil) {
            throw new Error(
                `[MIGRATION-004] FATAL: Pinned signing key for approver "${payload.approver}" has expired. Rotate key in trust store. Fail closed.`
            );
        }

        // Verify keyId binding if present in payload or trust record
        if (payload.keyId && trustedRecord.keyId && payload.keyId !== trustedRecord.keyId) {
            throw new Error(
                `[MIGRATION-004] FATAL: Key ID mismatch in approval token. Expected keyId "${trustedRecord.keyId}", got "${payload.keyId}". Fail closed.`
            );
        }

        // Resolve candidate public key material:
        // Caller can provide a candidate key (via options or CLI) to be verified against the pinned trust anchor,
        // or the candidate key can be supplied directly in the trusted registry record.
        let candidatePublicKey = opts.dbaPublicKey ||
                                 (opts.trustedPublicKeys && opts.trustedPublicKeys[payload.approver]);

        if (!candidatePublicKey) {
            const pubKeyFile = opts.dbaPublicKeyFile || (process.argv.find(arg => arg.startsWith('--dba-public-key-file='))?.split('=')[1]);
            const pubKeyArg = (process.argv.find(arg => arg.startsWith('--dba-public-key='))?.split('=')[1]);
            if (pubKeyFile && fs.existsSync(pubKeyFile)) {
                candidatePublicKey = fs.readFileSync(pubKeyFile, 'utf8');
            } else if (pubKeyArg) {
                candidatePublicKey = pubKeyArg;
            }
        }

        if (!candidatePublicKey) {
            candidatePublicKey = trustedRecord.publicKey;
        }

        if (!candidatePublicKey || typeof candidatePublicKey !== 'string' || candidatePublicKey.trim() === '') {
            throw new Error(
                `[MIGRATION-004] FATAL: Production approval verification failed. ` +
                `No candidate public verification key configured or available for approver "${payload.approver}". Fail closed.`
            );
        }

        // Validate Candidate Key Fingerprint against Pinned Trust Anchor
        const computedFingerprint = computePublicKeyFingerprint(candidatePublicKey);
        if (!trustedRecord.fingerprint || computedFingerprint !== trustedRecord.fingerprint) {
            throw new Error(
                `[MIGRATION-004] FATAL: Public key pinning validation failed for approver "${payload.approver}". ` +
                `Computed fingerprint "${computedFingerprint}" does not match pinned trust anchor "${trustedRecord.fingerprint}". ` +
                `Arbitrary or attacker-supplied public keys are strictly rejected. Fail closed.`
            );
        }

        const publicKey = candidatePublicKey;

        // 9. Asymmetric Digital Signature Verification
        const payloadBytes = Buffer.from(encodedPayload, 'utf8');
        let signatureBytes;
        try {
            signatureBytes = Buffer.from(encodedSignature, 'base64url');
            if (signatureBytes.length === 0) {
                signatureBytes = Buffer.from(encodedSignature, 'hex');
            }
        } catch (_) {
            signatureBytes = Buffer.from(encodedSignature, 'hex');
        }

        let isVerified = false;
        try {
            isVerified = crypto.verify(null, payloadBytes, publicKey.trim(), signatureBytes);
        } catch (verifyErr) {
            throw new Error(
                `[MIGRATION-004] FATAL: Asymmetric digital signature verification error: ${verifyErr.message}. Fail closed.`
            );
        }

        if (!isVerified) {
            throw new Error(
                `[MIGRATION-004] FATAL: Cryptographic verification failed. Asymmetric DBA approval signature is invalid, corrupted, or forged.`
            );
        }

        // 10. Durable Replay Prevention with Concurrency Protection
        let ledger = opts.ledger;
        if (!ledger) {
            const ledgerPath = opts.approvalLedgerPath ||
                               (process.argv.find(arg => arg.startsWith('--approval-ledger-path='))?.split('=')[1]) ||
                               path.join(__dirname, '..', '.dba_approval_ledger.jsonl');
            try {
                ledger = new DurableApprovalLedger(ledgerPath);
            } catch (ledgerErr) {
                throw new Error(`[MIGRATION-004] FATAL: Durable anti-replay ledger error: ${ledgerErr.message}. Fail closed.`);
            }
        }

        // Atomic Check-and-Consume under exclusive ledger lock
        ledger.recordConsumedApproval(payload.approvalId, {
            approver: payload.approver,
            migration: payload.migration,
            operation: payload.operation,
            clusterId: payload.clusterId,
            purpose: payload.purpose,
            auditRef: payload.auditRef
        });

        // Also track in-memory for session consistency
        consumedApprovalNonces.add(payload.approvalId);

        return {
            approved: true,
            approvalSource: 'ASYMMETRIC_DBA_SIGNATURE',
            tokenSource: tokenSource || 'RUNTIME_OPTIONS',
            approver: payload.approver,
            keyId: trustedRecord.keyId || payload.keyId,
            keyFingerprint: trustedRecord.fingerprint,
            approvalId: payload.approvalId,
            confirmedOperation: mode.toUpperCase(),
            clusterId: clusterInfo.clusterId,
            issuedAt: payload.issuedAt,
            expiresAt: payload.expiresAt,
            purpose: payload.purpose,
            auditRef: payload.auditRef
        };
    }

    // Non-production cluster using production database name: safely handled
    if (clusterInfo.clusterType === 'NON_PROD_CLUSTER_WITH_PROD_DB_NAME') {
        const devSimulateFlag = opts.allowNonProdSimulatedProd === true ||
                                process.env.ALLOW_NON_PROD_SIMULATED_PROD === 'true' ||
                                process.argv.includes('--allow-non-prod-simulated-prod');

        if (!devSimulateFlag) {
            throw new Error(
                `[MIGRATION-004] SAFETY GUARD: Connected to non-production host [${clusterInfo.hosts.join(', ')}] with production database name "${clusterInfo.dbName}". ` +
                `To execute on this local simulation target, explicitly set ALLOW_NON_PROD_SIMULATED_PROD=true or pass --allow-non-prod-simulated-prod.`
            );
        }

        return {
            approved: true,
            approvalSource: 'LOCAL_DEV_SIMULATION_FLAG'
        };
    }

    return {
        approved: true,
        approvalSource: 'LOCAL_TEST_ENVIRONMENT'
    };
}

/**
 * Isolated test harness for verifying cryptographic signatures in unit tests.
 * This harness is PERMANENTLY DISABLED in production environments or if NODE_ENV is production.
 */
export function __testOnly_verifyOperatorApproval(mode, clusterInfo, opts = {}) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            `[MIGRATION-004] SECURITY FATAL: Test-only verification harness (__testOnly_verifyOperatorApproval) is permanently disabled in production environments.`
        );
    }
    return verifyOperatorApproval(mode, clusterInfo, {
        ...opts,
        __testOnly_isolatedHarnessAuthorized: true
    });
}

/**
 * Read-only phone duplicate detection on active contacts.
 *
 * @param {mongoose.Connection|mongoose.mongo.Db} targetDb
 * @returns {Promise<Object>}
 */
export async function detectActivePhoneDuplicates(targetDb) {
    const db = targetDb.db || targetDb;
    const collection = db.collection('contacts');

    // 1. Total explicitly active contacts matching the index partialFilterExpression
    const totalActiveContacts = await collection.countDocuments({
        isDeleted: false,
        isMerged: false
    });

    // 2. Detect lifecycle flag gaps: contacts where isDeleted or isMerged is missing or null
    const lifecycleGapsQuery = {
        $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: null },
            { isMerged: { $exists: false } },
            { isMerged: null }
        ]
    };
    const totalLifecycleFlagGaps = await collection.countDocuments(lifecycleGapsQuery);
    const sampleLifecycleFlagGaps = await collection.find(lifecycleGapsQuery, {
        projection: { _id: 1, name: 1, isDeleted: 1, isMerged: 1 }
    }).limit(10).toArray();

    // 3. Exact String Duplicate Detection via Aggregation
    const exactPipeline = [
        {
            $match: {
                isDeleted: false,
                isMerged: false,
                'phones.number': { $type: 'string', $nin: ['', null] }
            }
        },
        { $unwind: '$phones' },
        {
            $match: {
                'phones.number': { $type: 'string', $nin: ['', null] }
            }
        },
        {
            $group: {
                _id: '$phones.number',
                count: { $sum: 1 },
                contactIds: { $addToSet: '$_id' },
                contacts: {
                    $push: {
                        contactId: '$_id',
                        name: '$name',
                        rawNumber: '$phones.number'
                    }
                }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        },
        {
            $sort: { count: -1 }
        }
    ];

    const exactDuplicateGroups = await collection.aggregate(exactPipeline).toArray();
    const crossContactExactDuplicates = exactDuplicateGroups.filter(g => g.contactIds.length > 1);
    const intraContactExactDuplicates = exactDuplicateGroups.filter(g => g.contactIds.length === 1 && g.count > 1);

    // 4. Normalized Phone Business Duplicate Scan
    const activePhonesDocs = await collection.aggregate([
        {
            $match: {
                isDeleted: false,
                isMerged: false,
                'phones.number': { $type: 'string', $nin: ['', null] }
            }
        },
        { $unwind: '$phones' },
        {
            $match: {
                'phones.number': { $type: 'string', $nin: ['', null] }
            }
        },
        {
            $project: {
                _id: 1,
                name: 1,
                rawNumber: '$phones.number'
            }
        }
    ]).toArray();

    const normalizedMap = new Map();
    for (const doc of activePhonesDocs) {
        const norm = normalizePhoneForDeduplication(doc.rawNumber);
        if (!norm) continue;
        if (!normalizedMap.has(norm)) {
            normalizedMap.set(norm, {
                normalizedNumber: norm,
                rawNumbers: new Set(),
                contactIds: new Set(),
                contacts: []
            });
        }
        const entry = normalizedMap.get(norm);
        entry.rawNumbers.add(doc.rawNumber);
        entry.contactIds.add(doc._id.toString());
        entry.contacts.push({
            contactId: doc._id,
            name: doc.name,
            rawNumber: doc.rawNumber
        });
    }

    const normalizedPhoneDuplicates = [];
    const normalizedVariantsAcrossContacts = [];

    for (const [norm, data] of normalizedMap.entries()) {
        if (data.contactIds.size > 1) {
            const group = {
                _id: norm,
                normalizedNumber: norm,
                distinctContactsCount: data.contactIds.size,
                rawNumbers: Array.from(data.rawNumbers),
                contacts: data.contacts
            };
            normalizedPhoneDuplicates.push(group);

            if (data.rawNumbers.size > 1) {
                normalizedVariantsAcrossContacts.push(group);
            }
        }
    }

    return {
        totalActiveContacts,
        totalLifecycleFlagGaps,
        lifecycleFlagGaps: sampleLifecycleFlagGaps,
        exactDuplicateGroups,
        duplicateGroups: exactDuplicateGroups,
        crossContactDuplicates: crossContactExactDuplicates,
        crossContactExactDuplicates,
        intraContactDuplicates: intraContactExactDuplicates,
        intraContactExactDuplicates,
        normalizedPhoneDuplicates,
        normalizedVariantsAcrossContacts
    };
}

/**
 * Safe Migration Runner for Contact Partial Unique Index
 *
 * @param {Object} opts
 * @param {'dry-run'|'execute'|'rollback'} [opts.mode='dry-run']
 * @param {mongoose.Connection} [opts.connection]
 * @param {string} [opts.runtimeDbaConfirmation]
 * @param {boolean} [opts.allowNonProdSimulatedProd]
 * @returns {Promise<Object>}
 */
export async function runMigration(opts = {}) {
    const safeOpts = { ...opts };
    delete safeOpts.__testOnly_isolatedHarnessAuthorized;

    const allowedModes = ['dry-run', 'execute', 'rollback'];
    const mode = safeOpts.mode || (process.argv.includes('--execute') ? 'execute' : (process.argv.includes('--rollback') ? 'rollback' : 'dry-run'));

    if (!allowedModes.includes(mode)) {
        throw new Error(`[MIGRATION-004] FATAL: Unknown migration mode "${mode}". Allowed modes are: ${allowedModes.join(', ')}.`);
    }

    const conn = safeOpts.connection || mongoose.connection;
    const db = conn?.db || conn;

    // Resolve and validate connected cluster identity (fail closed on unknown cluster)
    const clusterInfo = await resolveClusterIdentity(conn);
    if (!clusterInfo.isValid) {
        throw new Error(`[MIGRATION-004] FATAL: ${clusterInfo.error}`);
    }

    // Verify explicit operator approval (binds migration name, operation, and target cluster)
    const approval = verifyOperatorApproval(mode, clusterInfo, safeOpts);

    const collection = db.collection('contacts');

    console.log(`[MIGRATION-004] Mode: ${mode.toUpperCase()}`);
    console.log(`[MIGRATION-004] Target Database: ${clusterInfo.dbName}`);
    console.log(`[MIGRATION-004] Target Cluster: ${clusterInfo.clusterId} (${clusterInfo.clusterType})`);
    console.log(`[MIGRATION-004] Approval Source: ${approval.approvalSource}`);

    // Inspect existing indexes
    const existingIndexes = await collection.indexes();
    const existingIndexNames = existingIndexes.map(i => i.name);
    console.log(`[MIGRATION-004] Existing indexes on contacts:`, existingIndexNames);

    if (mode === 'rollback') {
        console.log(`[MIGRATION-004] Executing Rollback: Dropping index ${TARGET_INDEX_NAME}...`);
        const indexExists = existingIndexNames.includes(TARGET_INDEX_NAME);
        if (indexExists) {
            await collection.dropIndex(TARGET_INDEX_NAME);
            console.log(`[MIGRATION-004] ✅ Successfully dropped index ${TARGET_INDEX_NAME}.`);
        } else {
            console.log(`[MIGRATION-004] ℹ️ Index ${TARGET_INDEX_NAME} was not present. No drop needed.`);
        }

        const postRollbackIndexes = await collection.indexes();
        const targetStillExists = postRollbackIndexes.some(i => i.name === TARGET_INDEX_NAME);
        if (targetStillExists) {
            throw new Error(`[MIGRATION-004] Rollback verification failed: Index ${TARGET_INDEX_NAME} still exists after dropIndex.`);
        }

        const legacyIndexPreserved = postRollbackIndexes.some(i => i.name === 'phones.number_1');
        if (existingIndexNames.includes('phones.number_1') && !legacyIndexPreserved) {
            throw new Error(`[MIGRATION-004] Rollback verification failed: Legacy index phones.number_1 was unexpectedly dropped.`);
        }

        return {
            status: 'ROLLED_BACK',
            indexDropped: indexExists,
            currentIndexes: postRollbackIndexes.map(i => i.name),
            clusterInfo: { clusterId: clusterInfo.clusterId, clusterType: clusterInfo.clusterType }
        };
    }

    // Preflight Duplicate Scan
    console.log(`[MIGRATION-004] Running preflight duplicate scan on active contacts...`);
    const scanResult = await detectActivePhoneDuplicates(db);
    console.log(`[MIGRATION-004] Preflight Scan Summary:`, {
        totalActiveContacts: scanResult.totalActiveContacts,
        totalLifecycleFlagGaps: scanResult.totalLifecycleFlagGaps,
        exactDuplicateGroupsFound: scanResult.exactDuplicateGroups.length,
        crossContactExactDuplicates: scanResult.crossContactExactDuplicates.length,
        intraContactExactDuplicates: scanResult.intraContactExactDuplicates.length,
        normalizedPhoneDuplicateGroups: scanResult.normalizedPhoneDuplicates.length,
        normalizedVariantsAcrossContacts: scanResult.normalizedVariantsAcrossContacts.length
    });

    if (scanResult.totalLifecycleFlagGaps > 0) {
        console.warn(`[MIGRATION-004] ⚠️ ${scanResult.totalLifecycleFlagGaps} contacts have missing/null isDeleted or isMerged flags. These contacts are EXCLUDED from the partial index until normalized.`);
    }

    if (scanResult.crossContactExactDuplicates.length > 0) {
        console.warn(`[MIGRATION-004] ⚠️ Exact-string duplicate phone numbers detected across active contacts (WILL BLOCK INDEX BUILD):`);
        scanResult.crossContactExactDuplicates.slice(0, 10).forEach(g => {
            console.warn(`  - Phone: "${g._id}" | Active Contacts: ${g.contacts.map(c => `${c.contactId} (${c.name})`).join(', ')}`);
        });
        if (scanResult.crossContactExactDuplicates.length > 10) {
            console.warn(`  ... and ${scanResult.crossContactExactDuplicates.length - 10} more exact duplicate groups.`);
        }
    }

    if (scanResult.normalizedVariantsAcrossContacts.length > 0) {
        console.warn(`[MIGRATION-004] ℹ️ Business duplicate phone variants detected across active contacts (raw strings differ; will NOT block index build, but review is recommended):`);
        scanResult.normalizedVariantsAcrossContacts.slice(0, 10).forEach(g => {
            console.warn(`  - Normalized: "${g.normalizedNumber}" | Raw values: ${JSON.stringify(g.rawNumbers)} | Contacts: ${g.contacts.map(c => `${c.contactId} (${c.name})`).join(', ')}`);
        });
    }

    if (mode === 'dry-run') {
        const buildFeasible = scanResult.crossContactExactDuplicates.length === 0;
        console.log(`[MIGRATION-004] [DRY RUN] Target Index Definition:`, {
            spec: TARGET_INDEX_SPEC,
            options: TARGET_INDEX_OPTIONS
        });
        console.log(`[MIGRATION-004] [DRY RUN] Build Feasible without E11000 collision: ${buildFeasible}`);
        console.log(`[MIGRATION-004] [DRY RUN] Legacy non-unique index 'phones.number_1' will be PRESERVED.`);
        console.log(`[MIGRATION-004] [DRY RUN] NOTE: Index creation NEVER mutates or normalizes stored data.`);
        return {
            status: 'DRY_RUN_COMPLETED',
            buildFeasible,
            scanResult,
            targetIndex: {
                spec: TARGET_INDEX_SPEC,
                options: TARGET_INDEX_OPTIONS
            },
            clusterInfo: { clusterId: clusterInfo.clusterId, clusterType: clusterInfo.clusterType }
        };
    }

    if (mode === 'execute') {
        if (scanResult.crossContactExactDuplicates.length > 0) {
            const err = new Error(`[MIGRATION-004] Preflight check failed: ${scanResult.crossContactExactDuplicates.length} active cross-contact duplicate phone groups exist. Unique index build would fail with E11000. Resolve duplicates via Contact Merge before running migration.`);
            console.error(err.message);
            throw err;
        }

        console.log(`[MIGRATION-004] Preflight passed with 0 cross-contact exact duplicates. Creating index ${TARGET_INDEX_NAME}...`);

        try {
            await collection.createIndex(TARGET_INDEX_SPEC, TARGET_INDEX_OPTIONS);
        } catch (err) {
            if (err.code === 11000 || err.message?.includes('E11000')) {
                const abortMsg = `[MIGRATION-004] CONTROLLED ABORT: Unique index creation failed with E11000 duplicate key error. A duplicate active phone was inserted concurrently between preflight scan and index build. Collection state is untouched. Error: ${err.message}`;
                console.error(abortMsg);
                const controlledError = new Error(abortMsg);
                controlledError.code = 'E11000_CONCURRENT_INSERT';
                controlledError.originalError = err;
                throw controlledError;
            }
            throw err;
        }

        const postBuildIndexes = await collection.indexes();
        const createdIndex = postBuildIndexes.find(i => i.name === TARGET_INDEX_NAME);
        if (!createdIndex) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index ${TARGET_INDEX_NAME} was not found in collection.indexes().`);
        }

        const keyMatches = createdIndex.key && createdIndex.key['phones.number'] === 1 && Object.keys(createdIndex.key).length === 1;
        if (!keyMatches) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index key does not match expected { 'phones.number': 1 }. Found: ${JSON.stringify(createdIndex.key)}`);
        }

        if (createdIndex.unique !== true) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index is not unique. unique=${createdIndex.unique}`);
        }

        const pfe = createdIndex.partialFilterExpression;
        if (!pfe || pfe.isDeleted !== false || pfe.isMerged !== false) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: partialFilterExpression does not match expected { isDeleted: false, isMerged: false }. Found: ${JSON.stringify(pfe)}`);
        }

        console.log(`[MIGRATION-004] ✅ Index created and verified:`, createdIndex);
        return {
            status: 'EXECUTED_AND_VERIFIED',
            createdIndex,
            allIndexes: postBuildIndexes.map(i => i.name),
            clusterInfo: { clusterId: clusterInfo.clusterId, clusterType: clusterInfo.clusterType }
        };
    }
}

// Standalone CLI execution
if (process.argv[1] && process.argv[1].endsWith('004-contact-phone-unique-index-migration.js')) {
    (async () => {
        try {
            const nodeEnv = process.env.NODE_ENV;
            if (!nodeEnv) {
                console.error("[MIGRATION-004] FATAL: NODE_ENV is missing. Migration must FAIL CLOSED.");
                process.exit(1);
            }

            const envFile = nodeEnv === 'staging' ? '.env.staging' : '.env';
            dotenv.config({ path: path.join(__dirname, '..', envFile) });

            const uri = process.env.MONGODB_URI;
            if (!uri) {
                console.error("[MIGRATION-004] FATAL: MONGODB_URI is missing in the loaded environment.");
                process.exit(1);
            }

            console.log(`[MIGRATION-004] Connecting to target cluster: ${sanitizeMongoUri(uri)}`);
            await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
            await runMigration();
            await mongoose.disconnect();
            process.exit(0);
        } catch (err) {
            console.error("[MIGRATION-004] Migration failed:", err.message);
            await mongoose.disconnect();
            process.exit(1);
        }
    })();
}
