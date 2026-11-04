import Redis from 'ioredis';

const [,, workerId, portStr, lockKey, modeOrHoldMs, param5] = process.argv;
const port = parseInt(portStr, 10);

const LUA_RELEASE_LOCK = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

async function run() {
    const redis = new Redis({
        host: '127.0.0.1',
        port: port,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true
    });

    try {
        await redis.connect();
    } catch (connErr) {
        process.send?.({ error: `Connection failed: ${connErr.message}` });
        process.exit(1);
    }

    if (modeOrHoldMs === 'rogue_release') {
        const attackerToken = 'rogue_token_attacker_999';
        const released = await redis.eval(LUA_RELEASE_LOCK, 1, lockKey, attackerToken);
        process.send?.({ status: 'ROGUE_RELEASE_RESULT', released: Number(released) });
        await redis.quit();
        process.exit(0);
        return;
    }

    if (modeOrHoldMs === 'ttl_crashed_worker') {
        const token = `crashed_token_${workerId}`;
        const res = await redis.set(lockKey, token, 'NX', 'EX', 1);
        process.send?.({ status: 'CRASHED_WORKER_LOCK_SET', acquired: res === 'OK', token });
        // Simulates crash without releasing lock
        process.exit(0);
        return;
    }

    if (modeOrHoldMs === 'try_acquire_once') {
        const token = `new_worker_token_${workerId}`;
        const res = await redis.set(lockKey, token, 'NX', 'EX', 10);
        process.send?.({ status: 'TRY_ACQUIRE_RESULT', acquired: res === 'OK' });
        if (res === 'OK') {
            await redis.eval(LUA_RELEASE_LOCK, 1, lockKey, token);
        }
        await redis.quit();
        process.exit(0);
        return;
    }

    // Default mode: acquire and hold
    const holdDurationMs = parseInt(modeOrHoldMs, 10) || 500;
    const timeoutMs = parseInt(param5, 10) || 5000;
    const token = `worker_${workerId}_pid_${process.pid}_${Date.now()}`;
    const startWait = Date.now();
    let acquired = false;

    while (Date.now() - startWait < timeoutMs) {
        try {
            const res = await redis.set(lockKey, token, 'NX', 'EX', 10);
            if (res === 'OK' || res === true) {
                acquired = true;
                break;
            }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 40));
    }

    if (!acquired) {
        process.send?.({ status: 'TIMEOUT', workerId, error: 'DISTRIBUTED_LOCK_TIMEOUT' });
        await redis.quit();
        process.exit(0);
        return;
    }

    const acquiredAt = Date.now();
    process.send?.({ status: 'ACQUIRED', workerId, token, acquiredAt });

    // Hold the lock for requested duration
    await new Promise(r => setTimeout(r, holdDurationMs));

    // Atomic release using Lua script
    const released = await redis.eval(LUA_RELEASE_LOCK, 1, lockKey, token);
    const releasedAt = Date.now();
    process.send?.({ status: 'RELEASED', workerId, token, released: Boolean(released), releasedAt });

    await redis.quit();
    process.exit(0);
}

run().catch(err => {
    process.send?.({ error: err.message, stack: err.stack });
    process.exit(1);
});
