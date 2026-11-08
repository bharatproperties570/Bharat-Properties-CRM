import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import facebookService from '../services/FacebookService.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

test('FacebookService — Meta Credentials Resolution, OAuth & Multi-Business Page Discovery', async (t) => {
    const service = facebookService;
    const originalEnv = { ...process.env };
    const originalAxiosGet = axios.get;
    const originalFindOne = SystemSetting.findOne;
    const originalFindOneAndUpdate = SystemSetting.findOneAndUpdate;

    t.afterEach(() => {
        process.env = { ...originalEnv };
        axios.get = originalAxiosGet;
        SystemSetting.findOne = originalFindOne;
        SystemSetting.findOneAndUpdate = originalFindOneAndUpdate;
    });

    await t.test('1. Meta Credentials Resolution: _resolveAppCredentials', async () => {
        // 1.1 Prioritizes saved DB config over environment placeholders
        process.env.FB_CLIENT_ID = 'YOUR_FB_CLIENT_ID';
        process.env.FB_CLIENT_SECRET = 'YOUR_FB_SECRET';
        const dbConfig = {
            appId: ' 987654321098765 ',
            appSecret: ' secret_from_db_123 '
        };

        const resolved = service._resolveAppCredentials(dbConfig);
        assert.equal(resolved.appId, '987654321098765', 'DB appId should be trimmed and prioritized');
        assert.equal(resolved.appSecret, 'secret_from_db_123', 'DB appSecret should be trimmed and prioritized');

        // 1.2 Falls back to valid environment variables when DB config is missing
        process.env.FB_CLIENT_ID = '  112233445566778  ';
        process.env.FB_CLIENT_SECRET = '  env_secret_456  ';
        const fromEnv = service._resolveAppCredentials({});
        assert.equal(fromEnv.appId, '112233445566778', 'Valid env appId should be used and trimmed');
        assert.equal(fromEnv.appSecret, 'env_secret_456', 'Valid env appSecret should be used and trimmed');

        // 1.3 Ignores environment variables starting with YOUR_ and defaults appId
        process.env.FB_CLIENT_ID = 'YOUR_APP_ID_HERE';
        process.env.FB_CLIENT_SECRET = 'YOUR_APP_SECRET_HERE';
        const defaultFallback = service._resolveAppCredentials(null);
        assert.equal(defaultFallback.appId, '1676785590510736', 'Default Bharat Properties Meta App ID fallback');
        assert.equal(defaultFallback.appSecret, '', 'Placeholder env secret should be ignored');
    });

    await t.test('2. Meta OAuth URL Generation: getOAuthUrl', async () => {
        SystemSetting.findOne = () => ({
            lean: async () => ({
                key: 'social_graph_config',
                value: { appId: '123456789012345' }
            })
        });

        const redirectUri = 'https://crm.bharatproperties.co/api/v1/social/facebook/callback';
        const result = await service.getOAuthUrl(redirectUri);

        assert.ok(result.url, 'Should return OAuth authorization URL');
        assert.equal(result.appId, '123456789012345');
        assert.equal(result.redirectUri, redirectUri);

        // Verify URL format and scopes
        const parsedUrl = new URL(result.url);
        assert.equal(parsedUrl.hostname, 'www.facebook.com');
        assert.equal(parsedUrl.searchParams.get('client_id'), '123456789012345');
        assert.equal(parsedUrl.searchParams.get('redirect_uri'), redirectUri);
        assert.equal(parsedUrl.searchParams.get('response_type'), 'code');
        assert.ok(parsedUrl.searchParams.get('state'), 'State parameter should be present');

        const scopes = parsedUrl.searchParams.get('scope').split(',');
        assert.ok(scopes.includes('business_management'), 'Must request business_management scope');
        assert.ok(scopes.includes('pages_show_list'), 'Must request pages_show_list scope');
        assert.ok(scopes.includes('pages_read_engagement'), 'Must request pages_read_engagement scope');
        assert.ok(scopes.includes('pages_manage_posts'), 'Must request pages_manage_posts scope');
        assert.ok(scopes.includes('instagram_basic'), 'Must request instagram_basic scope');
        assert.ok(scopes.includes('instagram_content_publish'), 'Must request instagram_content_publish scope');
        assert.ok(scopes.includes('public_profile'), 'Must request public_profile scope');
    });

    await t.test('3. Multi-Business Page Discovery & OAuth Callback: handleOAuthCallback', async () => {
        let savedConfig = null;
        SystemSetting.findOne = () => ({
            lean: async () => ({
                key: 'social_graph_config',
                value: {
                    appId: '123456789012345',
                    appSecret: 'test_meta_app_secret_abc'
                }
            })
        });
        SystemSetting.findOneAndUpdate = async (filter, update) => {
            savedConfig = update.$set;
            return { value: savedConfig };
        };

        // Mock Meta Graph API responses
        axios.get = async (url, options = {}) => {
            const params = options.params || {};

            // 1. Code -> Short-lived token
            if (url.includes('/oauth/access_token') && params.code) {
                return { data: { access_token: 'short_lived_token_111' } };
            }
            // 2. Short-lived -> Long-lived token
            if (url.includes('/oauth/access_token') && params.grant_type === 'fb_exchange_token') {
                return { data: { access_token: 'long_lived_token_60days' } };
            }
            // 3. /me/accounts -> user pages
            if (url.includes('/me/accounts')) {
                return {
                    data: {
                        data: [
                            {
                                id: 'page_101',
                                name: 'General Personal Page',
                                access_token: 'page_token_101',
                                category: 'Real Estate'
                            }
                        ]
                    }
                };
            }
            // 3b. /me/businesses -> user business portfolios
            if (url.includes('/me/businesses')) {
                return {
                    data: {
                        data: [
                            { id: 'biz_888', name: 'Bharat Properties Portfolio' }
                        ]
                    }
                };
            }
            // 3b. /{biz.id}/owned_pages -> business owned pages
            if (url.includes('/biz_888/owned_pages')) {
                return {
                    data: {
                        data: [
                            {
                                id: 'page_202',
                                name: 'Bharat Properties Official Page',
                                access_token: 'page_token_bharat_official',
                                category: 'Real Estate Company',
                                instagram_business_account: {
                                    id: 'ig_999',
                                    username: 'bharatproperties_official'
                                }
                            }
                        ]
                    }
                };
            }
            // 4. Token debug inspection
            if (url.includes('/debug_token')) {
                return {
                    data: {
                        data: {
                            is_valid: true,
                            expires_at: 0,
                            scopes: ['pages_show_list', 'business_management']
                        }
                    }
                };
            }

            throw new Error(`Unhandled axios.get URL: ${url}`);
        };

        const result = await service.handleOAuthCallback('valid_test_code_123', 'https://crm.bharatproperties.co/callback');

        assert.equal(result.success, true);
        assert.equal(result.data.pageName, 'Bharat Properties Official Page', 'Should prioritize page with "Bharat Properties"');
        assert.equal(result.data.pageId, 'page_202');
        assert.equal(result.data.instagram.username, 'bharatproperties_official');

        // Check persisted data in SystemSetting
        assert.ok(savedConfig, 'Config should be persisted to system settings');
        assert.equal(savedConfig.value.pageId, 'page_202');
        assert.equal(savedConfig.value.pageAccessToken, 'page_token_bharat_official');
        assert.equal(savedConfig.value.igUserId, 'ig_999');
        assert.equal(savedConfig.value.igUsername, 'bharatproperties_official');
    });

    await t.test('4. Discovery Fallback & Direct Page Lookup', async () => {
        let savedConfig = null;
        SystemSetting.findOne = () => ({
            lean: async () => ({
                key: 'social_graph_config',
                value: {
                    appId: '123456789012345',
                    appSecret: 'test_meta_app_secret_abc',
                    pageId: 'custom_page_555'
                }
            })
        });
        SystemSetting.findOneAndUpdate = async (filter, update) => {
            savedConfig = update.$set;
            return { value: savedConfig };
        };

        axios.get = async (url, options = {}) => {
            const params = options.params || {};

            if (url.includes('/oauth/access_token')) {
                return { data: { access_token: 'mock_token' } };
            }
            // Both /me/accounts and /me/businesses return empty
            if (url.includes('/me/accounts')) {
                return { data: { data: [] } };
            }
            if (url.includes('/me/businesses')) {
                return { data: { data: [] } };
            }
            // Direct page lookup fallback matches config.pageId
            if (url.includes('/custom_page_555')) {
                return {
                    data: {
                        id: 'custom_page_555',
                        name: 'Bharat Properties Direct Lookup',
                        access_token: 'page_token_direct_555',
                        instagram_business_account: null
                    }
                };
            }
            if (url.includes('/debug_token')) {
                return { data: { data: { is_valid: true } } };
            }
            throw new Error(`Unhandled axios.get URL: ${url}`);
        };

        const result = await service.handleOAuthCallback('test_code', 'https://crm.bharatproperties.co/callback');
        assert.equal(result.success, true);
        assert.equal(result.data.pageId, 'custom_page_555');
        assert.equal(result.data.pageName, 'Bharat Properties Direct Lookup');
        assert.equal(savedConfig.value.pageAccessToken, 'page_token_direct_555');
    });

    await t.test('5. Error Resilience: Throws meaningful error when no pages found', async () => {
        SystemSetting.findOne = () => ({
            lean: async () => ({
                key: 'social_graph_config',
                value: {
                    appId: '123456789012345',
                    appSecret: 'test_meta_app_secret_abc'
                }
            })
        });

        axios.get = async (url) => {
            if (url.includes('/oauth/access_token')) {
                return { data: { access_token: 'mock_token' } };
            }
            if (url.includes('/me/accounts')) return { data: { data: [] } };
            if (url.includes('/me/businesses')) return { data: { data: [] } };
            throw new Error(`Unhandled URL: ${url}`);
        };

        await assert.rejects(
            async () => {
                await service.handleOAuthCallback('test_code', 'https://crm.bharatproperties.co/callback');
            },
            {
                name: 'Error',
                message: /No Facebook Pages found under this account/
            }
        );
    });
});
