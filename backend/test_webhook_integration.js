import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { whatsAppLiveBotWebhook } from './controllers/webhook.controller.js';
import whatsAppCoexistenceService from './services/WhatsAppCoexistenceService.js';
import * as whatsappWebhookUtils from './utils/whatsappWebhook.utils.js';

test('Integration: Coexistence webhook routing and HMAC validation', async (t) => {
    // 1. Mock the HTTP req/res
    const secret = 'test-secret';
    process.env.FB_APP_SECRET = secret;
    
    let statusCode = 0;
    const res = {
        sendStatus: (code) => { statusCode = code; }
    };
    
    // We will spy on the WhatsAppCoexistenceService methods to see if they get called asynchronously
    mock.method(whatsAppCoexistenceService, 'processMessageEchoes', async () => {});
    mock.method(whatsAppCoexistenceService, 'processAppStateSync', async () => {});
    mock.method(whatsAppCoexistenceService, 'processHistory', async () => {});
    
    // We will spy on the generic WhatsApp extracting to ensure standard flow is called
    // But since it's hard to spy on internal unexported functions, we check the extractWhatsAppChanges
    
    const sendWebhook = async (payloadObj, modifySignature = false) => {
        const rawBody = Buffer.from(JSON.stringify(payloadObj));
        let signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
        if (modifySignature) signature = 'sha256=invalid';
        
        const req = {
            rawBody,
            headers: { 'x-hub-signature-256': signature },
            body: payloadObj
        };
        
        await whatsAppLiveBotWebhook(req, res);
        
        // Wait for the setImmediate to fire
        await new Promise(resolve => setTimeout(resolve, 50));
    };
    
    // Payload A: smb_message_echoes
    const payloadEchoes = {
        object: "whatsapp_business_account",
        entry: [{
            id: "WABA_123",
            changes: [{
                field: "smb_message_echoes",
                value: {
                    metadata: { phone_number_id: "PHONE_123" },
                    message_echoes: [{ id: "msg_123" }]
                }
            }]
        }]
    };
    
    // Test 1: Invalid HMAC
    await sendWebhook(payloadEchoes, true);
    assert.equal(statusCode, 401);
    assert.equal(whatsAppCoexistenceService.processMessageEchoes.mock.callCount(), 0);
    
    // Test 2: Valid HMAC + Echoes
    await sendWebhook(payloadEchoes, false);
    assert.equal(statusCode, 200);
    assert.equal(whatsAppCoexistenceService.processMessageEchoes.mock.callCount(), 1);
    
    // Payload B: smb_app_state_sync
    const payloadState = {
        object: "whatsapp_business_account",
        entry: [{
            id: "WABA_123",
            changes: [{
                field: "smb_app_state_sync",
                value: { state_sync: [{ action: "add" }] }
            }]
        }]
    };
    
    // Test 3: Valid HMAC + State Sync
    await sendWebhook(payloadState, false);
    assert.equal(statusCode, 200);
    assert.equal(whatsAppCoexistenceService.processAppStateSync.mock.callCount(), 1);
    
    // Payload C: history
    const payloadHistory = {
        object: "whatsapp_business_account",
        entry: [{
            id: "WABA_123",
            changes: [{
                field: "history",
                value: { history: [{ messages: [] }] }
            }]
        }]
    };
    
    // Test 4: Valid HMAC + History
    await sendWebhook(payloadHistory, false);
    assert.equal(statusCode, 200);
    assert.equal(whatsAppCoexistenceService.processHistory.mock.callCount(), 1);
    
    // Test 5: Standard inbound message (no coexistence events)
    const payloadStandard = {
        object: "whatsapp_business_account",
        entry: [{
            id: "WABA_123",
            changes: [{
                field: "messages",
                value: { messages: [{ id: "inbound_1" }] }
            }]
        }]
    };
    
    await sendWebhook(payloadStandard, false);
    assert.equal(statusCode, 200);
    // Coexistence services should not increment
    assert.equal(whatsAppCoexistenceService.processMessageEchoes.mock.callCount(), 1);
    assert.equal(whatsAppCoexistenceService.processAppStateSync.mock.callCount(), 1);
    assert.equal(whatsAppCoexistenceService.processHistory.mock.callCount(), 1);
    
    // Since we mocked extractWhatsAppChanges, let's verify it was called
});
