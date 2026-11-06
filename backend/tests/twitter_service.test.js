import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import twitterService from '../services/TwitterService.js';

describe('Twitter / X API v2 Real Integration Suite', () => {

    it('1. Throws clear actionable error when Twitter credentials are not configured', async () => {
        // Stub _getConfig to return empty config
        const originalGetConfig = twitterService._getConfig;
        twitterService._getConfig = async () => ({});

        try {
            await assert.rejects(
                async () => {
                    await twitterService.postTweet('Exciting new project launch!');
                },
                /Twitter \/ X integration is not configured/
            );
        } finally {
            twitterService._getConfig = originalGetConfig;
        }
    });

    it('2. Builds valid RFC 5849 OAuth 1.0a Authorization header with HMAC-SHA1', () => {
        const dummyConfig = {
            apiKey: 'test_consumer_key_123',
            apiSecret: 'test_consumer_secret_456',
            accessToken: 'test_access_token_789',
            accessTokenSecret: 'test_token_secret_000'
        };

        const header = twitterService._buildOAuth1Header(
            'POST',
            'https://api.twitter.com/2/tweets',
            {},
            dummyConfig
        );

        assert.ok(header.startsWith('OAuth '), 'Header must start with OAuth');
        assert.ok(header.includes('oauth_consumer_key="test_consumer_key_123"'));
        assert.ok(header.includes('oauth_token="test_access_token_789"'));
        assert.ok(header.includes('oauth_signature_method="HMAC-SHA1"'));
        assert.ok(header.includes('oauth_signature="'));
        assert.ok(header.includes('oauth_nonce="'));
        assert.ok(header.includes('oauth_timestamp="'));
    });

    it('3. Validates credentials format in verifyCredentials', async () => {
        // Missing credentials
        const emptyRes = await twitterService.verifyCredentials({});
        assert.equal(emptyRes.success, false);
        assert.ok(emptyRes.error.includes('Missing required credentials'));

        // Partial credentials missing secret
        const partialRes = await twitterService.verifyCredentials({ apiKey: 'key1' });
        assert.equal(partialRes.success, false);
        assert.ok(partialRes.error.includes('Missing required credentials'));
    });
});
