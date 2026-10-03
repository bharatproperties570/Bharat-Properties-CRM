import assert from 'assert';
import provider from '../utils/SecretProvider.js';

process.env.NODE_ENV = 'production';
process.env.TEST_SECRET = 'placeholder-requires-external-secret';

const originalExit = process.exit;
let exitCode = null;
process.exit = (code) => { exitCode = code; };

provider.getRequiredSecret('TEST_SECRET');

assert.strictEqual(exitCode, 1, 'Production should fail closed (exit 1) for missing secrets');

process.exit = originalExit;
console.log('✅ SecretProvider tests passed');
