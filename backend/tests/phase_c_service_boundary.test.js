/**
 * Phase C — WorkflowEngine Service Boundary Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Proves that WorkflowEngine.executeAction → send_communication → whatsapp
 * now calls WhatsAppService directly and no longer imports or invokes
 * social.controller.js or constructs mockReq/mockRes objects.
 *
 * Tests are static-analysis + pure-logic based.
 * No live MongoDB, Redis, or Meta WhatsApp API required.
 *
 * Run with: node --test backend/tests/phase_c_service_boundary.test.js
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEPath   = join(__dirname, '../src/utils/WorkflowEngine.js');
const WESource = readFileSync(WEPath, 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// TEST-3: Controller not imported/called by WorkflowEngine
// (Run first — foundational assertion)
// ─────────────────────────────────────────────────────────────────────────────
describe('TEST-3 — Controller Isolation', () => {

    it('WorkflowEngine has no static import of social.controller.js', () => {
        // Strip comments before checking to avoid false negatives from doc references
        const executableLines = WESource
            .split('\n')
            .filter(l => !l.trim().startsWith('//'))
            .map(l => l.replace(/\/\/.*$/, ''));
        const hasStaticImport = executableLines.some(l =>
            /import\s+.*social\.controller/.test(l)
        );
        assert.ok(!hasStaticImport, 'Static import of social.controller.js must not exist in WorkflowEngine');
    });

    it('WorkflowEngine has no dynamic import of social.controller.js', () => {
        const executableLines = WESource
            .split('\n')
            .filter(l => !l.trim().startsWith('//'))
            .map(l => l.replace(/\/\/.*$/, ''));
        const hasDynImport = executableLines.some(l =>
            /import\s*\(.*social\.controller/.test(l)
        );
        assert.ok(!hasDynImport, 'Dynamic import of social.controller.js must not exist in WorkflowEngine');
    });

    it('WorkflowEngine does not reference sendWhatsAppMessage as a callable', () => {
        // Filter both // line comments and JSDoc * comment lines
        const executableLines = WESource
            .split('\n')
            .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
            .map(l => l.replace(/\/\/.*$/, ''));
        const hasSendWAMsg = executableLines.some(l =>
            /sendWhatsAppMessage\s*\(/.test(l)
        );
        assert.ok(!hasSendWAMsg, 'sendWhatsAppMessage() must not be called in WorkflowEngine (comments excluded)');
    });

    it('WorkflowEngine does not construct mockReq objects', () => {
        const executableLines = WESource
            .split('\n')
            .filter(l => !l.trim().startsWith('//'))
            .map(l => l.replace(/\/\/.*$/, ''));
        const hasMockReq = executableLines.some(l => /mockReq/.test(l));
        assert.ok(!hasMockReq, 'mockReq must not exist in WorkflowEngine');
    });

    it('WorkflowEngine does not construct mockRes objects', () => {
        const executableLines = WESource
            .split('\n')
            .filter(l => !l.trim().startsWith('//'))
            .map(l => l.replace(/\/\/.*$/, ''));
        const hasMockRes = executableLines.some(l => /mockRes/.test(l));
        assert.ok(!hasMockRes, 'mockRes must not exist in WorkflowEngine');
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// TEST-1: send_communication → WhatsAppService path exists
// ─────────────────────────────────────────────────────────────────────────────
describe('TEST-1 — WhatsAppService Path Present', () => {

    it('WorkflowEngine imports WhatsAppService dynamically for send_communication', () => {
        // The new path uses: import('../../services/WhatsAppService.js')
        assert.ok(
            WESource.includes("import('../../services/WhatsAppService.js')"),
            'Dynamic import of WhatsAppService.js must exist in the send_communication block'
        );
    });

    it('WorkflowEngine calls WhatsAppService.sendTemplate for template sends', () => {
        assert.ok(
            WESource.includes('WhatsAppService.sendTemplate('),
            'WhatsAppService.sendTemplate() must be called in WorkflowEngine'
        );
    });

    it('WorkflowEngine calls WhatsAppService.sendMessage for plain-text sends', () => {
        // Check in the send_communication block (not just send_notification)
        const sendCommStart = WESource.indexOf("action.channel === 'whatsapp'");
        const sendCommEnd   = WESource.indexOf("action.channel === 'sms'");
        const block = WESource.slice(sendCommStart, sendCommEnd);
        assert.ok(
            block.includes('WhatsAppService.sendMessage('),
            'WhatsAppService.sendMessage() must be called in the send_communication/whatsapp block'
        );
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// TEST-2: Exact arguments — languageCode and templateComponents
// ─────────────────────────────────────────────────────────────────────────────
describe('TEST-2 — Correct Argument Mapping', () => {

    it('language comes from templateDef.language — not hardcoded en_US (Phase C.2 correction)', () => {
        // Phase C.2: language is read from live template definition, same as old controller path
        // old controller: templateDef?.language || language || 'en' (language was always undefined from mockReq)
        // Phase C.2: templateDef?.language || 'en'
        assert.ok(
            WESource.includes("templateDef?.language || 'en'"),
            "Language must be read from templateDef?.language — hardcoded 'en_US' was a Phase C bug (fixed in C.2)"
        );
        assert.ok(
            !WESource.includes("action.languageCode || action.language || 'en_US'"),
            "action.languageCode / 'en_US' must no longer be in the send_communication path (Phase C.2 fix)"
        );
    });

    it('_buildMetaComponents result (Meta-format) is passed to sendTemplate — not raw templateComponents (Phase C.2 correction)', () => {
        // Phase C.2: raw crmParams are transformed via _buildMetaComponents before sendTemplate
        const sendBlock = WESource.slice(
            WESource.indexOf("action.channel === 'whatsapp'"),
            WESource.indexOf("action.channel === 'sms'")
        );
        assert.ok(
            sendBlock.includes('metaComponents'),
            'metaComponents (from _buildMetaComponents) must be the 4th arg to sendTemplate'
        );
        assert.ok(
            sendBlock.includes('_buildMetaComponents('),
            '_buildMetaComponents must be called to transform CRM params into Meta format'
        );
    });

    it('_buildTemplateComponents is still called (named-param resolution preserved)', () => {
        const sendCommStart = WESource.indexOf("action.channel === 'whatsapp'");
        const sendCommEnd   = WESource.indexOf("action.channel === 'sms'");
        const block = WESource.slice(sendCommStart, sendCommEnd);
        assert.ok(
            block.includes('_buildTemplateComponents('),
            '_buildTemplateComponents must still be called in the send_communication/whatsapp block'
        );
    });

    it('recipientMobile is the first argument to sendTemplate and sendMessage', () => {
        assert.ok(
            WESource.includes('WhatsAppService.sendTemplate(\n                                recipientMobile,') ||
            WESource.includes('WhatsAppService.sendTemplate(recipientMobile,') ||
            WESource.includes('sendTemplate(\n                                recipientMobile'),
            'recipientMobile must be the first argument to sendTemplate'
        );
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// TEST-4 & TEST-5: Success and failure propagation — static verification
// ─────────────────────────────────────────────────────────────────────────────
describe('TEST-4/5 — Error Propagation', () => {

    it('WhatsApp failure throws an Error (propagates to outer catch for AutomationLog failure)', () => {
        // The fix: throw new Error(...) when waResult.error — allows outer catch to log failure
        assert.ok(
            WESource.includes("throw new Error(`WhatsApp template send failed:"),
            'Template send failure must throw an Error so the outer catch logs to AutomationLog'
        );
    });

    it('No silent .catch() swallowing WhatsApp errors in send_communication block', () => {
        const sendCommStart = WESource.indexOf("action.channel === 'whatsapp'");
        const sendCommEnd   = WESource.indexOf("action.channel === 'sms'");
        const block = WESource.slice(sendCommStart, sendCommEnd);
        // The old pattern was .catch(e => console.error(...)) — errors were silently consumed
        assert.ok(
            !block.includes('.catch(e =>') && !block.includes('.catch(err =>'),
            'WhatsApp errors in send_communication must not be silently caught (.catch) — they must propagate'
        );
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// TEST-6: AutomationLog behavior unchanged
// ─────────────────────────────────────────────────────────────────────────────
describe('TEST-6 — AutomationLog Intact', () => {

    it('AutomationLog.create for success (Trigger ruleType) still exists', () => {
        assert.ok(
            WESource.includes("ruleType: 'Trigger'"),
            "AutomationLog.create with ruleType: 'Trigger' must remain in executeAction"
        );
    });

    it('AutomationLog.create for failure still exists', () => {
        assert.ok(
            WESource.includes("status: 'failed'"),
            "AutomationLog.create with status: 'failed' must remain in executeAction"
        );
    });

    it('AutomationLog.create for AutomatedAction success still exists', () => {
        assert.ok(
            WESource.includes("ruleType: 'AutomatedAction'"),
            "AutomationLog.create for AutomatedAction path must remain"
        );
    });

    it('idempotencyKey logic is preserved', () => {
        assert.ok(
            WESource.includes('idempotencyKey'),
            'idempotencyKey must still be used for AutomationLog deduplication'
        );
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// TEST-7: Trigger → AutomatedAction → send_communication structure intact
// ─────────────────────────────────────────────────────────────────────────────
describe('TEST-7 — Trigger Execution Chain Intact', () => {

    it('fireEvent method still exists', () => {
        assert.ok(
            WESource.includes('static async fireEvent('),
            'WorkflowEngine.fireEvent must still exist'
        );
    });

    it('evaluateRules method still exists', () => {
        assert.ok(
            WESource.includes('static evaluateRules('),
            'WorkflowEngine.evaluateRules must still exist'
        );
    });

    it('executeAction method still exists', () => {
        assert.ok(
            WESource.includes('static async executeAction('),
            'WorkflowEngine.executeAction must still exist'
        );
    });

    it('fire_automated_action branch still exists', () => {
        assert.ok(
            WESource.includes("action.type === 'fire_automated_action'"),
            "fire_automated_action branch must remain in executeAction"
        );
    });

    it('send_communication branch still exists', () => {
        assert.ok(
            WESource.includes("action.type === 'send_communication'"),
            "send_communication branch must remain in executeAction"
        );
    });

    it('mobile resolution fallback (Lead.findById) is preserved', () => {
        assert.ok(
            WESource.includes('recipientMobile') && WESource.includes('entityData.mobile || entityData.primaryPhone'),
            'Mobile number resolution from entity and Lead fallback must be preserved'
        );
    });

});

console.log('\n✅ Phase C Service Boundary Test Suite Loaded\n');
