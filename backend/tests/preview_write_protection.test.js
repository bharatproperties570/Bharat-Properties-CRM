import test from 'node:test';
import assert from 'node:assert/strict';
import { previewWriteGuard, isRestrictedPreviewRequest, extractHostname } from '../middleware/previewGuard.middleware.js';

test('Preview-to-Production Write Protection Suite', async (t) => {
    await t.test('1. extractHostname helper normalizes origin and referer strings accurately', () => {
        assert.equal(extractHostname('https://pr-42-bharatproperties570s-projects.vercel.app/leads'), 'pr-42-bharatproperties570s-projects.vercel.app');
        assert.equal(extractHostname('http://crm.bharatproperties.co:4000/api'), 'crm.bharatproperties.co');
        assert.equal(extractHostname('https://bharatproperties.co'), 'bharatproperties.co');
        assert.equal(extractHostname(null), null);
        assert.equal(extractHostname(''), null);
        assert.equal(extractHostname('invalid:::url'), null);
    });

    await t.test('2. isRestrictedPreviewRequest detects Vercel Preview Origin', () => {
        const req = {
            headers: {
                origin: 'https://bharat-properties-crm-git-feature.vercel.app'
            }
        };
        assert.equal(isRestrictedPreviewRequest(req), true);
    });

    await t.test('3. isRestrictedPreviewRequest detects Vercel Preview Referer', () => {
        const req = {
            headers: {
                referer: 'https://preview-123.vercel.app/dashboard'
            }
        };
        assert.equal(isRestrictedPreviewRequest(req), true);
    });

    await t.test('4. isRestrictedPreviewRequest detects explicit client environment header', () => {
        const req1 = { headers: { 'x-client-environment': 'preview' } };
        const req2 = { headers: { 'x-preview-mode': 'preview' } };
        const req3 = { headers: { 'x-vercel-deployment': 'preview' } };
        assert.equal(isRestrictedPreviewRequest(req1), true);
        assert.equal(isRestrictedPreviewRequest(req2), true);
        assert.equal(isRestrictedPreviewRequest(req3), true);
    });

    await t.test('5. isRestrictedPreviewRequest detects restricted user identity and role', () => {
        const reqUserFlag = { headers: {}, user: { isRestrictedPreview: true, email: 'tester@preview.local' } };
        const reqRole = { headers: {}, user: { role: { name: 'preview' }, email: 'tester@preview.local' } };
        const reqTokenClaim = { headers: {}, auth: { restrictedPreview: true } };

        assert.equal(isRestrictedPreviewRequest(reqUserFlag), true);
        assert.equal(isRestrictedPreviewRequest(reqRole), true);
        assert.equal(isRestrictedPreviewRequest(reqTokenClaim), true);
    });

    await t.test('6. Production custom domain is NOT classified as preview', () => {
        const reqProd = {
            headers: {
                origin: 'https://crm.bharatproperties.co'
            },
            user: { role: { name: 'Admin' }, isRestrictedPreview: false }
        };
        assert.equal(isRestrictedPreviewRequest(reqProd), false);
    });

    await t.test('7. Local development origin is NOT classified as preview', () => {
        const reqLocal = {
            headers: {
                origin: 'http://localhost:5173'
            },
            user: { role: { name: 'Agent' } }
        };
        assert.equal(isRestrictedPreviewRequest(reqLocal), false);
    });

    await t.test('8. Safe read-only methods (GET, HEAD, OPTIONS) pass through preview guard', () => {
        const methods = ['GET', 'HEAD', 'OPTIONS'];
        for (const method of methods) {
            let nextCalled = false;
            const req = {
                method,
                url: '/api/leads',
                headers: { origin: 'https://test.vercel.app' }
            };
            const res = {
                status: () => { throw new Error('status should not be called for safe methods'); }
            };
            previewWriteGuard(req, res, () => { nextCalled = true; });
            assert.equal(nextCalled, true, `Expected ${method} to pass through`);
            assert.equal(req.isPreviewRestricted, true);
        }
    });

    await t.test('9. Essential auth routes (POST /api/auth/login, refresh, logout) pass through in preview', () => {
        const permittedPaths = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];
        for (const path of permittedPaths) {
            let nextCalled = false;
            const req = {
                method: 'POST',
                url: path,
                headers: { origin: 'https://preview.vercel.app' }
            };
            const res = {
                status: () => { throw new Error('status should not be called for allowed auth route'); }
            };
            previewWriteGuard(req, res, () => { nextCalled = true; });
            assert.equal(nextCalled, true, `Expected POST ${path} to be permitted in preview`);
        }
    });

    await t.test('10. State-mutating requests (POST, PUT, PATCH, DELETE) in preview context receive HTTP 403', () => {
        const mutatingScenarios = [
            { method: 'POST', path: '/api/leads' },
            { method: 'PUT', path: '/api/contacts/6aec01' },
            { method: 'DELETE', path: '/api/deals/6aec02' },
            { method: 'PATCH', path: '/api/inventory/6aec03' },
            { method: 'POST', path: '/api/marketing/send-campaign' },
            { method: 'POST', path: '/api/whatsapp-actions/send' },
            { method: 'POST', path: '/api/authority/verify' },
            { method: 'PUT', path: '/api/system-settings' },
            { method: 'POST', path: '/api/upload' }
        ];

        for (const { method, path } of mutatingScenarios) {
            let statusCode = null;
            let jsonBody = null;
            let nextCalled = false;

            const req = {
                method,
                originalUrl: path,
                url: path,
                headers: {
                    origin: 'https://preview-deploy-branch.vercel.app'
                },
                user: { email: 'preview_user@example.com' }
            };

            const res = {
                status: (code) => {
                    statusCode = code;
                    return {
                        json: (data) => { jsonBody = data; }
                    };
                }
            };

            previewWriteGuard(req, res, () => { nextCalled = true; });

            assert.equal(nextCalled, false, `Expected ${method} ${path} to be blocked`);
            assert.equal(statusCode, 403);
            assert.equal(jsonBody?.code, 'PREVIEW_WRITE_PROHIBITED');
            assert.equal(jsonBody?.details?.policy, 'PREVIEW_MUTATION_DENIED');
        }
    });

    await t.test('11. Direct API caller cannot bypass guard when token identity is marked preview', () => {
        let statusCode = null;
        let jsonBody = null;
        let nextCalled = false;

        // Attacker omits Origin/Referer headers but possesses a restricted preview token/user identity
        const req = {
            method: 'DELETE',
            url: '/api/contacts/12345',
            headers: {}, // No browser headers!
            user: { isRestrictedPreview: true, email: 'attacker@preview.test' }
        };

        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { jsonBody = data; }
                };
            }
        };

        previewWriteGuard(req, res, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(statusCode, 403);
        assert.equal(jsonBody?.code, 'PREVIEW_WRITE_PROHIBITED');
    });

    await t.test('12. Legitimate production user retains full write permissions', () => {
        let nextCalled = false;

        const req = {
            method: 'POST',
            url: '/api/leads',
            headers: {
                origin: 'https://crm.bharatproperties.co'
            },
            user: {
                email: 'admin@bharatproperties.co',
                role: { name: 'admin' },
                isRestrictedPreview: false
            }
        };

        const res = {
            status: () => { throw new Error('status should not be called for production user'); }
        };

        previewWriteGuard(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, true, 'Legitimate production user request must proceed');
    });
});
