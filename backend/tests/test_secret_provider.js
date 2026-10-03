import assert from 'assert';
import provider from '../utils/SecretProvider.js';

process.env.NODE_ENV = 'production';
process.env.TEST_SECRET = 'placeholder-requires-external-secret';

let threw = false;
try {
    provider.getRequiredSecret('TEST_SECRET');
} catch (err) {
    threw = true;
    assert(err.message.includes("is missing in production environment"), "Error message should match");
}

assert.strictEqual(threw, true, 'Production should throw an Error for missing secrets');
console.log('✅ SecretProvider tests passed');
