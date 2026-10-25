/**
 * Phase A Security Remediation Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for M0.10D Phase A security fixes:
 *  - SEC-01: NoSQL injection whitelist on getMarketingContent
 *  - SEC-02: WhatsApp config route authentication + admin authorization
 *  - STEP-3: verifyWebhook no longer writes plaintext token to filesystem
 *  - STEP-4: cronWorker writes ruleType: 'Trigger' (not 'TimeBasedTrigger')
 *
 * These tests are static unit/integration tests using Node's built-in assert.
 * They do NOT require a live MongoDB or Redis connection.
 * Run with: node backend/tests/phase_a_security.test.js
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// SEC-01: NoSQL Injection Whitelist Logic
// ─────────────────────────────────────────────────────────────────────────────
// We extract and test the exact whitelist logic from the patched controller
// in isolation — no Mongoose dependency.

const ALLOWED_QUERY_KEYS = ['dealId', 'status', 'type', 'author', 'date'];

function buildSafeQuery(rawQuery) {
    return Object.fromEntries(
        Object.entries(rawQuery)
            .filter(([key]) => ALLOWED_QUERY_KEYS.includes(key))
            .filter(([, val]) => typeof val === 'string')
    );
}

describe('SEC-01 — NoSQL Injection Whitelist', () => {

    it('allows valid scalar string filters to pass through', () => {
        const raw = { status: 'draft', type: 'image', dealId: '64abc123' };
        const safe = buildSafeQuery(raw);
        assert.deepStrictEqual(safe, { status: 'draft', type: 'image', dealId: '64abc123' });
    });

    it('blocks MongoDB $ne operator injection via status[$ne]', () => {
        // Express parses ?status[$ne]=draft into { status: { '$ne': 'draft' } }
        const raw = { status: { $ne: 'draft' } };
        const safe = buildSafeQuery(raw);
        // value is an object, not a string — must be stripped
        assert.deepStrictEqual(safe, {});
        assert.ok(!('status' in safe), 'status with $ne object must be stripped');
    });

    it('blocks $where operator at the key level', () => {
        const raw = { $where: 'this.author == "admin"' };
        const safe = buildSafeQuery(raw);
        assert.deepStrictEqual(safe, {});
    });

    it('blocks arbitrary non-whitelisted keys', () => {
        const raw = { __proto__: 'x', constructor: 'y', customField: 'z' };
        const safe = buildSafeQuery(raw);
        assert.deepStrictEqual(safe, {});
    });

    it('allows all five whitelisted keys simultaneously', () => {
        const raw = { dealId: 'abc', status: 'approved', type: 'post', author: 'user1', date: '2026-09-01' };
        const safe = buildSafeQuery(raw);
        assert.deepStrictEqual(safe, raw);
    });

    it('strips only the bad key while preserving valid sibling keys', () => {
        const raw = { status: 'draft', badKey: 'x', $gt: 'y' };
        const safe = buildSafeQuery(raw);
        assert.deepStrictEqual(safe, { status: 'draft' });
    });

    it('strips nested operator object values for a whitelisted key', () => {
        // Mongoose receives { dealId: { $gt: '' } } as an injection attempt
        const raw = { dealId: { $gt: '' } };
        const safe = buildSafeQuery(raw);
        assert.deepStrictEqual(safe, {});
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// SEC-02: Route Order Validation
// ─────────────────────────────────────────────────────────────────────────────
// Read the actual routes file and assert route registration order and
// authenticate/authorize presence — no Express runtime required.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routesPath = join(__dirname, '../routes/social.routes.js');
const routesSource = readFileSync(routesPath, 'utf8');

describe('SEC-02 — WhatsApp Route Security Order', () => {

    it('imports authorize from auth.middleware.js', () => {
        assert.ok(
            routesSource.includes("{ authenticate, authorize }"),
            'authorize must be imported alongside authenticate'
        );
    });

    it('router.use(authenticate) appears BEFORE /whatsapp/config', () => {
        const authPos   = routesSource.indexOf('router.use(authenticate)');
        const configPos = routesSource.indexOf("'/whatsapp/config'");
        assert.ok(authPos > -1,    'router.use(authenticate) must exist');
        assert.ok(configPos > -1,  '/whatsapp/config route must exist');
        assert.ok(authPos < configPos, 'authenticate must come BEFORE /whatsapp/config');
    });

    it('/whatsapp/config uses authorize("admin", "super admin")', () => {
        assert.ok(
            routesSource.includes("authorize('admin', 'super admin'), saveWhatsAppConfig"),
            'saveWhatsAppConfig must require admin role authorization'
        );
    });

    it('webhook routes remain public (before authenticate)', () => {
        const webhookGetPos  = routesSource.indexOf("router.get('/webhook'");
        const webhookPostPos = routesSource.indexOf("router.post('/webhook'");
        const authPos        = routesSource.indexOf('router.use(authenticate)');
        assert.ok(webhookGetPos  < authPos, 'GET /webhook must remain public (before authenticate)');
        assert.ok(webhookPostPos < authPos, 'POST /webhook must remain public (before authenticate)');
    });

    it('/whatsapp/templates appears after authenticate', () => {
        const authPos      = routesSource.indexOf('router.use(authenticate)');
        const templatesPos = routesSource.indexOf("'/whatsapp/templates'");
        assert.ok(templatesPos > authPos, '/whatsapp/templates must be behind authenticate');
    });

    it('temporary public debug comment is removed', () => {
        assert.ok(
            !routesSource.includes('TEMPORARILY PUBLIC TO DEBUG 401'),
            'Temporary debug comment must be removed'
        );
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: verifyWebhook — No plaintext token filesystem logging
// ─────────────────────────────────────────────────────────────────────────────

const controllerPath = join(__dirname, '../controllers/social.controller.js');
const controllerSource = readFileSync(controllerPath, 'utf8');

describe('STEP-3 — verifyWebhook Plaintext Logging Removed', () => {

    it('webhook_verify.log appendFileSync is not called in verifyWebhook', () => {
        // The dangerous pattern: appendFileSync with the token variable
        assert.ok(
            !controllerSource.includes("appendFileSync('webhook_verify.log'"),
            'appendFileSync writing to webhook_verify.log must be removed'
        );
    });

    it('verify token is not interpolated into any console.log call', () => {
        // Look for the old pattern: `token="${token}"` in a log line
        // Note: we check the verifyWebhook function scope (~line 511-550)
        const fnStart = controllerSource.indexOf('export const verifyWebhook');
        const fnEnd   = controllerSource.indexOf('export const receiveWebhook');
        const fnBody  = controllerSource.slice(fnStart, fnEnd);
        assert.ok(
            !fnBody.includes('token="${token}"') && !fnBody.includes("token='${token}'"),
            'Raw token value must not be interpolated into any log output'
        );
    });

    it('verifyWebhook still logs a safe verification attempt message', () => {
        assert.ok(
            controllerSource.includes('[Webhook] VERIFY attempt'),
            'Safe non-sensitive verification log must be present'
        );
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: cronWorker — ruleType correction
// ─────────────────────────────────────────────────────────────────────────────

const cronWorkerPath = join(__dirname, '../src/workers/cronWorker.js');
const cronWorkerSource = readFileSync(cronWorkerPath, 'utf8');

// Extract all ruleType values written to AutomationLog in cronWorker
const ruleTypePattern = /ruleType:\s*'([^']+)'/g;
const ruleTypesFound = [];
let m;
while ((m = ruleTypePattern.exec(cronWorkerSource)) !== null) {
    ruleTypesFound.push(m[1]);
}

describe('STEP-4 — AutomationLog ruleType Correction in cronWorker', () => {

    it('contains no executable TimeBasedTrigger ruleType writes', () => {
        // Strip inline comments from each line before scanning, so correction
        // annotations like  // STEP4: corrected from invalid 'TimeBasedTrigger'
        // do not produce false positives.
        const executableLines = cronWorkerSource
            .split('\n')
            .filter(line => !line.trim().startsWith('//'))   // skip full-line comments
            .map(line => line.replace(/\/\/.*$/, ''))         // strip inline comments
            .filter(line => line.includes("'TimeBasedTrigger'"));
        assert.strictEqual(
            executableLines.length, 0,
            `Found executable TimeBasedTrigger writes:\n${executableLines.join('\n')}`
        );
    });

    it('all AutomationLog ruleType values in cronWorker are canonical enum values', () => {
        const CANONICAL_ENUM = ['Trigger', 'Sequence', 'AutomatedAction', 'ScoringRule'];
        for (const rt of ruleTypesFound) {
            assert.ok(
                CANONICAL_ENUM.includes(rt),
                `Found non-canonical ruleType in cronWorker: '${rt}'`
            );
        }
    });

    it('finds exactly 3 Trigger ruleType writes (one per entity: lead, deal, activity)', () => {
        const triggerWrites = ruleTypesFound.filter(rt => rt === 'Trigger');
        assert.strictEqual(triggerWrites.length, 3, 'Expected exactly 3 Trigger ruleType entries');
    });

});

console.log('\n✅ Phase A Security Remediation Test Suite Loaded\n');
