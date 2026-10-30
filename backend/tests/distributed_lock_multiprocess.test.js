process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { fork } from 'node:child_process';

describe('Phase 1.6 & 1.9 — Distributed Multi-Process Locking & Redis Protocol Test Suite', () => {
    let server;
    let redisPort = 16395;
    const store = new Map();
    const timeouts = new Map();
    const activeSockets = new Set();
    const childScript = new URL('./helpers/lock_worker_child.js', import.meta.url).pathname;

    function parseResp(buffer) {
        const lines = buffer.toString().split('\r\n');
        const tokens = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('$')) {
                tokens.push(lines[i + 1]);
                i++;
            }
        }
        return tokens;
    }

    before(async () => {
        await new Promise((resolve) => {
            server = net.createServer((socket) => {
                activeSockets.add(socket);
                socket.on('close', () => activeSockets.delete(socket));
                socket.on('error', () => {
                    activeSockets.delete(socket);
                    socket.destroy();
                });

                socket.on('data', (buf) => {
                    const tokens = parseResp(buf);
                    if (tokens.length === 0) return;
                    const cmd = (tokens[0] || '').toUpperCase();

                    if (cmd === 'COMMAND') {
                        socket.write('*0\r\n');
                    } else if (cmd === 'PING') {
                        socket.write('+PONG\r\n');
                    } else if (cmd === 'GET') {
                        const key = tokens[1];
                        if (store.has(key)) {
                            const val = store.get(key);
                            socket.write(`$${Buffer.byteLength(val)}\r\n${val}\r\n`);
                        } else {
                            socket.write('$-1\r\n');
                        }
                    } else if (cmd === 'SET') {
                        const key = tokens[1];
                        const val = tokens[2];
                        const upper = tokens.map(t => (t || '').toUpperCase());
                        const hasNX = upper.includes('NX');
                        if (hasNX && store.has(key)) {
                            socket.write('$-1\r\n');
                        } else {
                            store.set(key, val);
                            const exIdx = upper.indexOf('EX');
                            if (exIdx !== -1 && tokens[exIdx + 1]) {
                                const sec = parseInt(tokens[exIdx + 1], 10);
                                clearTimeout(timeouts.get(key));
                                timeouts.set(key, setTimeout(() => store.delete(key), sec * 1000));
                            }
                            socket.write('+OK\r\n');
                        }
                    } else if (cmd === 'DEL') {
                        const key = tokens[1];
                        if (store.has(key)) {
                            store.delete(key);
                            clearTimeout(timeouts.get(key));
                            socket.write(':1\r\n');
                        } else {
                            socket.write(':0\r\n');
                        }
                    } else if (cmd === 'EVAL') {
                        const script = tokens[1] || '';
                        const key = tokens[3];
                        const token = tokens[4];

                        if (script.includes('del') && script.includes('get')) {
                            if (store.get(key) === token) {
                                store.delete(key);
                                clearTimeout(timeouts.get(key));
                                socket.write(':1\r\n');
                            } else {
                                socket.write(':0\r\n');
                            }
                        } else if (script.includes('expire') && script.includes('get')) {
                            const sec = parseInt(tokens[5] || '30', 10);
                            if (store.get(key) === token) {
                                clearTimeout(timeouts.get(key));
                                timeouts.set(key, setTimeout(() => store.delete(key), sec * 1000));
                                socket.write(':1\r\n');
                            } else {
                                socket.write(':0\r\n');
                            }
                        } else {
                            socket.write(':1\r\n');
                        }
                    } else if (cmd === 'QUIT') {
                        socket.write('+OK\r\n');
                        setTimeout(() => socket.destroy(), 10);
                    } else {
                        socket.write('+OK\r\n');
                    }
                });
            });

            server.listen(redisPort, () => {
                resolve();
            });
        });
    });

    after(async () => {
        for (const t of timeouts.values()) clearTimeout(t);
        timeouts.clear();
        store.clear();
        for (const s of activeSockets) s.destroy();
        activeSockets.clear();
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Multi-Process Mutual Exclusion across Separate OS Processes
    // ─────────────────────────────────────────────────────────────
    it('1. Multi-Process Mutual Exclusion: Process 2 is blocked until Process 1 completes and releases lock', async () => {
        store.clear();
        const lockKey = 'lock:baileys_outbound:session_mp_01';

        // Launch Process 1: holds lock for 400ms
        const p1 = fork(childScript, ['1', String(redisPort), lockKey, '400', '3000']);
        const p1Events = [];
        p1.on('message', msg => p1Events.push(msg));

        await new Promise(r => setTimeout(r, 60));

        // Launch Process 2: requests lock, wait timeout 3000ms, hold for 100ms
        const p2 = fork(childScript, ['2', String(redisPort), lockKey, '100', '3000']);
        const p2Events = [];
        p2.on('message', msg => p2Events.push(msg));

        await Promise.all([
            new Promise(res => p1.on('exit', res)),
            new Promise(res => p2.on('exit', res))
        ]);

        const p1Acquired = p1Events.find(e => e.status === 'ACQUIRED');
        const p1Released = p1Events.find(e => e.status === 'RELEASED');
        const p2Acquired = p2Events.find(e => e.status === 'ACQUIRED');
        const p2Released = p2Events.find(e => e.status === 'RELEASED');

        assert.ok(p1Acquired, 'Process 1 must have acquired lock');
        assert.ok(p1Released, 'Process 1 must have released lock');
        assert.ok(p2Acquired, 'Process 2 must have acquired lock');
        assert.ok(p2Released, 'Process 2 must have released lock');

        assert.ok(
            p2Acquired.acquiredAt >= p1Released.releasedAt - 5,
            `Process 2 acquiredAt (${p2Acquired.acquiredAt}) must be >= Process 1 releasedAt (${p1Released.releasedAt})`
        );
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Multi-Process Distributed Lock Timeout
    // ─────────────────────────────────────────────────────────────
    it('2. Multi-Process Timeout: Process 2 aborts with DISTRIBUTED_LOCK_TIMEOUT when lock cannot be acquired within timeout', async () => {
        store.clear();
        const lockKey = 'lock:baileys_outbound:session_mp_02';

        // Launch Process 1: holds lock for 1500ms
        const p1 = fork(childScript, ['1', String(redisPort), lockKey, '1500', '3000']);
        await new Promise(r => setTimeout(r, 60));

        // Launch Process 2: timeout of only 250ms (will expire while Process 1 is still holding)
        const p2 = fork(childScript, ['2', String(redisPort), lockKey, '100', '250']);
        const p2Events = [];
        p2.on('message', msg => p2Events.push(msg));

        await new Promise(res => p2.on('exit', res));
        p1.kill('SIGKILL');
        await new Promise(res => p1.on('exit', res));

        const p2Timeout = p2Events.find(e => e.status === 'TIMEOUT');
        assert.ok(p2Timeout, 'Process 2 must emit TIMEOUT status');
        assert.equal(p2Timeout.error, 'DISTRIBUTED_LOCK_TIMEOUT');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Ownership-Safe Atomic Release (Lua Script) via Child Process
    // ─────────────────────────────────────────────────────────────
    it('3. Ownership Safety: Attempting to release a lock with a mismatched token is rejected and leaves lock intact', async () => {
        store.clear();
        const lockKey = 'lock:baileys_outbound:session_mp_03';
        const legitToken = 'legit_token_worker_01';

        // Set lock in store
        store.set(lockKey, legitToken);

        // Spawn attacker child process in rogue_release mode
        const pAttacker = fork(childScript, ['attacker', String(redisPort), lockKey, 'rogue_release']);
        const attackerEvents = [];
        pAttacker.on('message', msg => attackerEvents.push(msg));
        await new Promise(res => pAttacker.on('exit', res));

        const rogueRes = attackerEvents.find(e => e.status === 'ROGUE_RELEASE_RESULT');
        assert.ok(rogueRes, 'Must receive rogue release result');
        assert.equal(rogueRes.released, 0, 'Rogue release with mismatched token must return 0');

        // Verify lock is STILL held by legit worker
        assert.equal(store.get(lockKey), legitToken, 'Lock must remain held by original token');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Lock Expiration via TTL & Re-acquisition via Child Processes
    // ─────────────────────────────────────────────────────────────
    it('4. Lock TTL Expiration: Lock with 1s TTL automatically expires and allows subsequent process to acquire', async () => {
        store.clear();
        const lockKey = 'lock:baileys_outbound:session_mp_04';

        // Spawn child process 1: acquires lock with 1s TTL and abruptly exits (crashes)
        const pCrashed = fork(childScript, ['crashed', String(redisPort), lockKey, 'ttl_crashed_worker']);
        const crashedEvents = [];
        pCrashed.on('message', msg => crashedEvents.push(msg));
        await new Promise(res => pCrashed.on('exit', res));

        const lockSet = crashedEvents.find(e => e.status === 'CRASHED_WORKER_LOCK_SET');
        assert.ok(lockSet, 'Crashed worker must have set lock');
        assert.equal(lockSet.acquired, true);

        // Spawn child process 2 immediately: try acquire once (must fail because lock is held)
        const pTryImmediate = fork(childScript, ['try_now', String(redisPort), lockKey, 'try_acquire_once']);
        const immediateEvents = [];
        pTryImmediate.on('message', msg => immediateEvents.push(msg));
        await new Promise(res => pTryImmediate.on('exit', res));

        const immediateRes = immediateEvents.find(e => e.status === 'TRY_ACQUIRE_RESULT');
        assert.ok(immediateRes);
        assert.equal(immediateRes.acquired, false, 'Immediate acquire attempt must fail while TTL is active');

        // Wait 1.1s for 1s TTL to expire in Redis
        await new Promise(r => setTimeout(r, 1100));

        // Spawn child process 3 after TTL expiry: try acquire once (must succeed!)
        const pTryPostExpiry = fork(childScript, ['try_after', String(redisPort), lockKey, 'try_acquire_once']);
        const postExpiryEvents = [];
        pTryPostExpiry.on('message', msg => postExpiryEvents.push(msg));
        await new Promise(res => pTryPostExpiry.on('exit', res));

        const postExpiryRes = postExpiryEvents.find(e => e.status === 'TRY_ACQUIRE_RESULT');
        assert.ok(postExpiryRes);
        assert.equal(postExpiryRes.acquired, true, 'Subsequent process must acquire lock after TTL expiration');
    });
});
