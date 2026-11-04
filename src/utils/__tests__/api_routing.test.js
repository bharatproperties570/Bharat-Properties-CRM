import { describe, it, expect } from 'vitest';
import { resolveApiBaseUrl, STABLE_TUNNEL_URL } from '../api.js';

describe('Frontend API Routing & Isolation Tests', () => {
    describe('Rule 1: Explicit VITE_API_URL Priority', () => {
        it('should strictly use explicit VITE_API_URL even if hostname is a production domain', () => {
            const customStagingUrl = 'https://api-staging.bharatproperties.co/api';
            const resolved = resolveApiBaseUrl({
                envApiUrl: customStagingUrl,
                hostname: 'bharatproperties.co',
                nodeEnv: 'production',
                envProd: 'true'
            });
            expect(resolved).toBe(customStagingUrl);
        });

        it('should strictly use explicit VITE_API_URL on Vercel preview environments', () => {
            const previewApi = 'https://mock-api.internal/api';
            const resolved = resolveApiBaseUrl({
                envApiUrl: previewApi,
                hostname: 'pr-42-bharat-crm.vercel.app',
                nodeEnv: 'production'
            });
            expect(resolved).toBe(previewApi);
        });

        it('should trim whitespace from explicit VITE_API_URL', () => {
            const resolved = resolveApiBaseUrl({
                envApiUrl: '  https://custom-api.com/api  ',
                hostname: 'localhost'
            });
            expect(resolved).toBe('https://custom-api.com/api');
        });
    });

    describe('Rule 2 & 3: Vercel Preview Isolation & Fail-Closed Behavior', () => {
        it('should NEVER silently connect to production backend on vercel.app domains without explicit config', () => {
            const previewHostnames = [
                'bharat-crm-preview.vercel.app',
                'branch-feat-sitevisit.vercel.app',
                'crm-preview-git-enterprise.vercel.app',
                'vercel.app'
            ];

            for (const hostname of previewHostnames) {
                const resolved = resolveApiBaseUrl({
                    envApiUrl: '',
                    hostname,
                    nodeEnv: 'production',
                    envProd: 'true'
                });
                expect(resolved).not.toBe(STABLE_TUNNEL_URL);
                expect(resolved).toBe('/api');
            }
        });

        it('should connect to STABLE_TUNNEL_URL ONLY on exact production domains', () => {
            const prodDomains = [
                'bharatproperties.co',
                'www.bharatproperties.co',
                'crm.bharatproperties.co'
            ];

            for (const hostname of prodDomains) {
                const resolved = resolveApiBaseUrl({
                    envApiUrl: '',
                    hostname
                });
                expect(resolved).toBe(STABLE_TUNNEL_URL);
            }
        });

        it('should not treat attacker or spoofed domain containing bharatproperties.co as production', () => {
            const attackerDomains = [
                'evil-bharatproperties.co.attacker.com',
                'bharatproperties.co.hack.net',
                'fakebharatproperties.co'
            ];

            for (const hostname of attackerDomains) {
                const resolved = resolveApiBaseUrl({
                    envApiUrl: '',
                    hostname
                });
                expect(resolved).not.toBe(STABLE_TUNNEL_URL);
                expect(resolved).toBe('/api');
            }
        });
    });

    describe('Rule 4: Browser Dev & Localhost Proxy Routing', () => {
        it('should route localhost browser to relative /api for Vite reverse proxying', () => {
            const devHosts = ['localhost', '127.0.0.1', '192.168.1.15', '10.0.0.5', 'dev-box.local'];
            for (const hostname of devHosts) {
                const resolved = resolveApiBaseUrl({
                    envApiUrl: '',
                    hostname,
                    nodeEnv: 'development'
                });
                expect(resolved).toBe('/api');
            }
        });
    });

    describe('Rule 5 & 6: Non-Browser (SSR / Node) Contexts', () => {
        it('should route SSR production to STABLE_TUNNEL_URL when hostname is undefined', () => {
            const resolved = resolveApiBaseUrl({
                envApiUrl: '',
                hostname: undefined,
                nodeEnv: 'production'
            });
            expect(resolved).toBe(STABLE_TUNNEL_URL);
        });

        it('should route SSR development to fallback localhost:4001/api when hostname is undefined', () => {
            const resolved = resolveApiBaseUrl({
                envApiUrl: '',
                hostname: undefined,
                nodeEnv: 'development',
                envProd: 'false'
            });
            expect(resolved).toBe('http://localhost:4001/api');
        });
    });
});
