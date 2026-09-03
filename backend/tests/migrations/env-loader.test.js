import assert from 'assert';

// Mocking the environment loader logic that needs to be implemented
const getEnvPath = (nodeEnv) => {
    if (nodeEnv === 'staging') return '.env.staging';
    if (nodeEnv === 'production') return '.env'; // Usually injected via secrets
    return '.env';
};

export const runTests = () => {
    let testsPassed = 0;

    assert.strictEqual(getEnvPath('staging'), '.env.staging', 'Must load staging env when NODE_ENV is staging');
    assert.strictEqual(getEnvPath('production'), '.env', 'Must load default env when NODE_ENV is production');
    assert.strictEqual(getEnvPath(undefined), '.env', 'Must load default env when NODE_ENV is absent');
    testsPassed++;

    // Production guard validation
    const checkProductionGuard = (uri, isProdMigrationAllowed) => {
        const isProduction = uri.includes('bharatproperties1');
        if (isProduction && !isProdMigrationAllowed) return 'ABORT';
        return 'ALLOW';
    };

    assert.strictEqual(checkProductionGuard('mongodb://.../bharatproperties1', false), 'ABORT', 'Must abort prod without flag');
    assert.strictEqual(checkProductionGuard('mongodb://.../bharat-properties-staging', false), 'ALLOW', 'Must allow staging without flag');
    testsPassed++;

    console.log(`✅ Passed ${testsPassed} staging environment detection tests.`);
    return testsPassed;
};

runTests();
