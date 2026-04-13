import axios from 'axios';

const WEBHOOK_URL = 'http://localhost:4000/api/webhooks/whatsapp-live-bot';

const payload = {
    object: 'whatsapp_business_account',
    entry: [{
        id: '123456789',
        changes: [{
            value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '123456789', phone_number_id: '987654321' },
                contacts: [{ profile: { name: 'Professional Test' }, wa_id: '919876543210' }],
                messages: [{
                    from: '919876543210',
                    id: 'wamid.HBgLOTE5ODc2N...ABC',
                    timestamp: Math.floor(Date.now() / 1000),
                    text: { body: 'Hello, I want to see this in the professional history view!' },
                    type: 'text'
                }]
            },
            field: 'messages'
        }]
    }]
};

async function testWebhook() {
    console.log('Sending mock WhatsApp message to:', WEBHOOK_URL);
    try {
        const res = await axios.post(WEBHOOK_URL, payload);
        console.log('✅ Webhook accepted:', res.status);
    } catch (err) {
        console.error('❌ Webhook failed:', err.response?.data || err.message);
    }
}

testWebhook();
