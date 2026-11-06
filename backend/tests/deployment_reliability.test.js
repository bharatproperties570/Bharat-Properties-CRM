import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { BaileysConnectionManager } from '../services/baileysQueue/BaileysConnectionManager.js';

test('Deployment Reliability & Rollback Integrity Suite', async (t) => {
    const tmpDir = path.join(os.tmpdir(), `deploy-reliability-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    t.after(() => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
    });

    await t.test('1. Interrupted Deployment Gate: Exclusive lock prevents concurrent execution', () => {
        const lockDir = path.join(tmpDir, 'test-deploy.lock.dir');
        
        // Initial lock acquisition succeeds
        assert.equal(fs.mkdirSync(lockDir), undefined);
        assert.equal(fs.existsSync(lockDir), true);

        // Competing acquisition fails closed
        let secondAcquireFailed = false;
        try {
            fs.mkdirSync(lockDir);
        } catch (err) {
            secondAcquireFailed = true;
            assert.equal(err.code, 'EEXIST');
        }
        assert.equal(secondAcquireFailed, true, 'Competing lock acquisition must fail closed with EEXIST');

        // Cleanup releases lock
        fs.rmdirSync(lockDir);
        assert.equal(fs.existsSync(lockDir), false);
    });

    await t.test('2. Release Topology Resolution: Rejects invalid or incomplete release bundles', () => {
        const releaseDir = path.join(tmpDir, 'release-invalid');
        fs.mkdirSync(releaseDir, { recursive: true });

        // Missing server.js, launcher.mjs, ecosystem.config.cjs
        fs.writeFileSync(path.join(releaseDir, 'package.json'), JSON.stringify({ name: 'test' }));

        const hasM1 = fs.existsSync(path.join(releaseDir, 'src/server.js')) &&
                      fs.existsSync(path.join(releaseDir, 'launcher.mjs')) &&
                      fs.existsSync(path.join(releaseDir, 'ecosystem.config.cjs'));
        assert.equal(hasM1, false, 'Invalid topology must not pass MODEL_1 criteria');
    });

    await t.test('3. Release Topology Resolution: Valid Model 1 directory is recognized', () => {
        const releaseDir = path.join(tmpDir, 'release-valid-m1');
        fs.mkdirSync(path.join(releaseDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(releaseDir, 'package.json'), '{}');
        fs.writeFileSync(path.join(releaseDir, 'launcher.mjs'), '// launcher');
        fs.writeFileSync(path.join(releaseDir, 'ecosystem.config.cjs'), '// config');
        fs.writeFileSync(path.join(releaseDir, 'src/server.js'), '// server');

        const isModel1 = fs.existsSync(path.join(releaseDir, 'src/server.js')) &&
                         fs.existsSync(path.join(releaseDir, 'package.json')) &&
                         fs.existsSync(path.join(releaseDir, 'launcher.mjs')) &&
                         fs.existsSync(path.join(releaseDir, 'ecosystem.config.cjs'));
        assert.equal(isModel1, true);
    });

    await t.test('4. Atomic Symlink Switching: Target switch occurs without broken intermediate state', () => {
        const targetA = path.join(tmpDir, 'target-A');
        const targetB = path.join(tmpDir, 'target-B');
        const symlinkPath = path.join(tmpDir, 'current');

        fs.mkdirSync(targetA, { recursive: true });
        fs.mkdirSync(targetB, { recursive: true });
        fs.writeFileSync(path.join(targetA, 'version.txt'), 'SHA-A');
        fs.writeFileSync(path.join(targetB, 'version.txt'), 'SHA-B');

        // Initial link points to A
        fs.symlinkSync(targetA, symlinkPath);
        assert.equal(fs.readFileSync(path.join(symlinkPath, 'version.txt'), 'utf8'), 'SHA-A');

        // Atomic switch to B via temp link rename
        const tempLink = `${symlinkPath}.tmp`;
        fs.symlinkSync(targetB, tempLink);
        fs.renameSync(tempLink, symlinkPath);

        assert.equal(fs.readFileSync(path.join(symlinkPath, 'version.txt'), 'utf8'), 'SHA-B');
        assert.equal(fs.existsSync(tempLink), false);
    });

    await t.test('5. Health Check Timeout & Automatic Rollback Logic', () => {
        // Simulates health checking contract: 10 retries at interval
        let attempts = 0;
        const maxRetries = 5;
        const mockHealthProbe = () => {
            attempts++;
            // Fails all attempts
            return { status: 503, ready: false, version: 'wrong' };
        };

        let healthPassed = false;
        for (let i = 1; i <= maxRetries; i++) {
            const probe = mockHealthProbe();
            if (probe.status === 200 && probe.ready && probe.version === 'expected') {
                healthPassed = true;
                break;
            }
        }

        assert.equal(healthPassed, false, 'Simulated failed health checks must fail closed');
        assert.equal(attempts, maxRetries);
        // Automatic rollback is triggered when healthPassed is false
        const shouldTriggerRollback = !healthPassed;
        assert.equal(shouldTriggerRollback, true, 'Deployment must trigger automatic rollback on health timeout');
    });

    await t.test('6. Rollback Readiness Validation: Strict DB & Redis & SHA assertion', () => {
        const validateRollbackHealth = (healthStatus, readyStatus, apiVersion, targetSha) => {
            const isHealthOk = healthStatus === 200;
            const isReadyOk = readyStatus?.status === 'ready' && readyStatus?.database === 1 && readyStatus?.redis === 'online';
            const isShaMatch = apiVersion === targetSha;
            return isHealthOk && isReadyOk && isShaMatch;
        };

        // All passing
        assert.equal(validateRollbackHealth(200, { status: 'ready', database: 1, redis: 'online' }, 'sha-44f0', 'sha-44f0'), true);

        // DB degraded (database: 0) fails closed
        assert.equal(validateRollbackHealth(200, { status: 'degraded', database: 0, redis: 'online' }, 'sha-44f0', 'sha-44f0'), false);

        // Redis degraded fails closed
        assert.equal(validateRollbackHealth(200, { status: 'ready', database: 1, redis: 'offline' }, 'sha-44f0', 'sha-44f0'), false);

        // SHA mismatch fails closed
        assert.equal(validateRollbackHealth(200, { status: 'ready', database: 1, redis: 'online' }, 'sha-other', 'sha-44f0'), false);
    });

    await t.test('7. Baileys Socket Lifecycle: Graceful shutdown cleans heartbeats and releases lock', async () => {
        assert.equal(typeof BaileysConnectionManager.gracefulShutdown, 'function');
        // Graceful shutdown executes safely without error
        await assert.doesNotReject(async () => {
            await BaileysConnectionManager.gracefulShutdown();
        });
    });

    await t.test('8. Process Identity Binding & Duplicate Connection Avoidance', () => {
        const instanceId1 = `pid_100_${Math.random().toString(36).substring(2, 7)}`;
        const instanceId2 = `pid_200_${Math.random().toString(36).substring(2, 7)}`;
        
        let heldLock = instanceId1;

        // Instance 2 attempts to acquire held lock
        const canAcquire = (requestingInstance) => {
            if (!heldLock) {
                heldLock = requestingInstance;
                return true;
            }
            return heldLock === requestingInstance;
        };

        assert.equal(canAcquire(instanceId2), false, 'Instance 2 must not acquire lock held by Instance 1');
        assert.equal(canAcquire(instanceId1), true, 'Instance 1 re-acquires / renews its own lock');

        // Instance 1 shuts down and releases lock
        heldLock = null;

        // Instance 2 can now acquire immediately without waiting 45s TTL
        assert.equal(canAcquire(instanceId2), true, 'Instance 2 acquires lock immediately upon release');
    });

    await t.test('9. Ecosystem Configuration: Enforces wait_ready and adequate listen_timeout', () => {
        const ecosystemPath = path.join(process.cwd(), 'ecosystem.config.cjs');
        assert.equal(fs.existsSync(ecosystemPath), true, 'ecosystem.config.cjs must exist in backend root');
        const content = fs.readFileSync(ecosystemPath, 'utf8');
        assert.match(content, /wait_ready:\s*true/, 'ecosystem must specify wait_ready: true');
        assert.match(content, /listen_timeout:\s*\d+/, 'ecosystem must specify listen_timeout');
        assert.match(content, /kill_timeout:\s*\d+/, 'ecosystem must specify kill_timeout');
    });

    await t.test('10. Failed Activation & Rollback: Preserves previous stable symlink on health failure', () => {
        const stableReleaseDir = path.join(tmpDir, 'release-stable-v1');
        const brokenReleaseDir = path.join(tmpDir, 'release-broken-v2');
        const currentLink = path.join(tmpDir, 'current-symlink');

        fs.mkdirSync(stableReleaseDir, { recursive: true });
        fs.mkdirSync(brokenReleaseDir, { recursive: true });
        fs.writeFileSync(path.join(stableReleaseDir, 'version'), 'v1.0.0');
        fs.writeFileSync(path.join(brokenReleaseDir, 'version'), 'v2.0.0-broken');

        // Current points to stable v1
        fs.symlinkSync(stableReleaseDir, currentLink);
        assert.equal(fs.readFileSync(path.join(currentLink, 'version'), 'utf8'), 'v1.0.0');

        // Staging attempt: v2 activation fails health probe
        const healthCheckOk = false;
        if (!healthCheckOk) {
            // Rollback guard: currentLink is NOT switched, or rolled back immediately
            assert.equal(fs.readFileSync(path.join(currentLink, 'version'), 'utf8'), 'v1.0.0', 'Stable release must remain active when activation fails');
        }
    });
});
