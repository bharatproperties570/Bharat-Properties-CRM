import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
    resolveApiBaseUrl, 
    STABLE_TUNNEL_URL, 
    getEnvVar, 
    isProductionApiUrl, 
    isVercelPreviewHost, 
    isExactProductionHost 
} from '../api.js';

describe('Frontend API Routing & Isolation Tests', () => {
    describe('Adapter Tests: getEnvVar', () => {
        const origProcessEnv = { ...process.env };
        let origWindowEnv;

        beforeEach(() => {
            origWindowEnv = typeof window !== 'undefined' ? window._env_ : undefined;
        });

        afterEach(() => {
            process.env = { ...origProcessEnv };
            if (typeof window !== 'undefined') {
                window._env_ = origWindowEnv;
            }
        });

        it('should resolve variable from process.env', () => {
            process.env.VITE_TEST_KEY = 'val_from_process';
            expect(getEnvVar('VITE_TEST_KEY')).toBe('val_from_process');
        });

        it('should fallback to window._env_ if not defined in process.env', () => {
            delete process.env.VITE_WINDOW_KEY;
            if (typeof window !== 'undefined') {
                window._env_ = { VITE_WINDOW_KEY: 'val_from_window' };
            }
            expect(getEnvVar('VITE_WINDOW_KEY')).toBe('val_from_window');
        });

        it('should return undefined when variable is absent in all adapters', () => {
            delete process.env.VITE_ABSENT_KEY;
            if (typeof window !== 'undefined') {
                window._env_ = {};
            }
            expect(getEnvVar('VITE_ABSENT_KEY')).toBeUndefined();
        });
    });

    describe('Helper Classifiers: isProductionApiUrl & isVercelPreviewHost', () => {
        it('should correctly identify production API URLs', () => {
            expect(isProductionApiUrl('https://api.bharatproperties.co/api')).toBe(true);
            expect(isProductionApiUrl('http://api.bharatproperties.co')).toBe(true);
            expect(isProductionApiUrl('https://bharatproperties.co/api')).toBe(true);
            expect(isProductionApiUrl('https://www.bharatproperties.co/api')).toBe(true);
            expect(isProductionApiUrl('https://api-staging.bharatproperties.co/api')).toBe(false);
            expect(isProductionApiUrl('http://localhost:5001/api')).toBe(false);
            expect(isProductionApiUrl('/api')).toBe(false);
        });

        it('should correctly classify Vercel preview hostnames', () => {
            expect(isVercelPreviewHost('pr-42.vercel.app')).toBe(true);
            expect(isVercelPreviewHost('bharat-crm-preview.vercel.app')).toBe(true);
            expect(isVercelPreviewHost('vercel.app')).toBe(true);
            expect(isVercelPreviewHost('bharatproperties.co')).toBe(false);
            expect(isVercelPreviewHost('localhost')).toBe(false);
        });

        it('should classify exact production domains', () => {
            expect(isExactProductionHost('bharatproperties.co')).toBe(true);
            expect(isExactProductionHost('www.bharatproperties.co')).toBe(true);
            expect(isExactProductionHost('crm.bharatproperties.co')).toBe(true);
            expect(isExactProductionHost('app.bharatproperties.co')).toBe(true);
            expect(isExactProductionHost('staging.bharatproperties.co')).toBe(false);
            expect(isExactProductionHost('fake-bharatproperties.co')).toBe(false);
        });
    });

    describe('Rule 1: Vercel Preview Strict Fail-Closed & Isolation Guard', () => {
        it('must REJECT production API URLs in Preview even when explicitly configured', () => {
            const previewHosts = [
                'bharat-crm-preview.vercel.app',
                'pr-102.vercel.app',
                'crm-preview-git-enterprise.vercel.app'
            ];

            for (const hostname of previewHosts) {
                expect(() => resolveApiBaseUrl({
                    envApiUrl: 'https://api.bharatproperties.co/api',
                    hostname,
                    nodeEnv: 'production'
                })).toThrow(/Security Exception/);

                expect(() => resolveApiBaseUrl({
                    envApiUrl: 'https://bharatproperties.co/api',
                    hostname,
                    nodeEnv: 'production'
                })).toThrow(/Security Exception/);
            }
        });

        it('must fail closed with a clear configuration error when Preview has no staging VITE_API_URL', () => {
            const previewHosts = [
                'bharat-crm-preview.vercel.app',
                'branch-feat-sitevisit.vercel.app',
                'vercel.app'
            ];

            for (const hostname of previewHosts) {
                expect(() => resolveApiBaseUrl({
                    envApiUrl: '',
                    hostname,
                    nodeEnv: 'production'
                })).toThrow(/Configuration Error/);
            }
        });

        it('must accept and route to valid staging API in Preview when explicitly configured', () => {
            const stagingUrl = 'https://api-staging.bharatproperties.co/api';
            const resolved = resolveApiBaseUrl({
                envApiUrl: stagingUrl,
                hostname: 'pr-42-bharat-crm.vercel.app',
                nodeEnv: 'production'
            });
            expect(resolved).toBe(stagingUrl);
        });
    });

    describe('Rule 2 & 3: Production Custom Domains', () => {
        it('should connect to STABLE_TUNNEL_URL on exact production domains when no explicit override is provided', () => {
            const prodDomains = [
                'bharatproperties.co',
                'www.bharatproperties.co',
                'crm.bharatproperties.co',
                'app.bharatproperties.co'
            ];

            for (const hostname of prodDomains) {
                const resolved = resolveApiBaseUrl({
                    envApiUrl: '',
                    hostname
                });
                expect(resolved).toBe(STABLE_TUNNEL_URL);
            }
        });

        it('should respect explicit production override on production custom domains', () => {
            const customProd = 'https://api.bharatproperties.co/api';
            const resolved = resolveApiBaseUrl({
                envApiUrl: customProd,
                hostname: 'bharatproperties.co'
            });
            expect(resolved).toBe(customProd);
        });

        it('should NOT treat spoofed domain containing bharatproperties.co as production', () => {
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

    describe('Rule 4 & 5: Dev Browser & Localhost Proxy Routing', () => {
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

        it('should respect explicit VITE_API_URL in development when provided', () => {
            const customDevApi = 'http://127.0.0.1:5001/api';
            const resolved = resolveApiBaseUrl({
                envApiUrl: customDevApi,
                hostname: 'localhost'
            });
            expect(resolved).toBe(customDevApi);
        });
    });

    describe('Rule 6 & 7: Non-Browser (SSR / Node) Contexts', () => {
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

    describe('Actual Environment-Resolution Adapter Integration (Calling without arguments)', () => {
        const origProcessEnv = { ...process.env };
        let origHostname;
        let origWindowEnv;

        beforeEach(() => {
            origHostname = window.location.hostname;
            origWindowEnv = window._env_;
        });

        afterEach(() => {
            process.env = { ...origProcessEnv };
            window._env_ = origWindowEnv;
            Object.defineProperty(window, 'location', {
                writable: true,
                value: { ...window.location, hostname: origHostname }
            });
        });

        it('should resolve via environment adapter on preview hostname with staging URL', () => {
            process.env.VITE_API_URL = 'https://api-staging.bharatproperties.co/api';
            Object.defineProperty(window, 'location', {
                writable: true,
                value: { ...window.location, hostname: 'preview-branch.vercel.app' }
            });

            expect(resolveApiBaseUrl()).toBe('https://api-staging.bharatproperties.co/api');
        });

        it('should throw Security Exception via environment adapter on preview hostname with production URL', () => {
            process.env.VITE_API_URL = 'https://api.bharatproperties.co/api';
            Object.defineProperty(window, 'location', {
                writable: true,
                value: { ...window.location, hostname: 'preview-branch.vercel.app' }
            });

            expect(() => resolveApiBaseUrl()).toThrow(/Security Exception/);
        });

        it('should throw Configuration Error via environment adapter on preview hostname when VITE_API_URL is missing', () => {
            delete process.env.VITE_API_URL;
            window._env_ = {};
            Object.defineProperty(window, 'location', {
                writable: true,
                value: { ...window.location, hostname: 'preview-branch.vercel.app' }
            });

            expect(() => resolveApiBaseUrl()).toThrow(/Configuration Error/);
        });

        it('should resolve via environment adapter on production custom domain', () => {
            delete process.env.VITE_API_URL;
            Object.defineProperty(window, 'location', {
                writable: true,
                value: { ...window.location, hostname: 'bharatproperties.co' }
            });

            expect(resolveApiBaseUrl()).toBe(STABLE_TUNNEL_URL);
        });

        it('should resolve via environment adapter on localhost development', () => {
            delete process.env.VITE_API_URL;
            Object.defineProperty(window, 'location', {
                writable: true,
                value: { ...window.location, hostname: 'localhost' }
            });

            expect(resolveApiBaseUrl()).toBe('/api');
        });
    });
});
