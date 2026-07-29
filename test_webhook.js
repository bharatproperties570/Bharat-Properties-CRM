import axios from 'axios';

const payload = {
    object: 'whatsapp_business_account',
    entry: [{
        id: '1234567890',
        changes: [{
            value: {
                messaging_product: 'whatsapp',
                metadata: {
                    display_phone_number: '9996000570',
                    phone_number_id: '9996000570'
                },
                contacts: [{
                    profile: { name: 'Test User' },
                    wa_id: '919876543210' // Sender phone number
                }],
                messages: [{
                    from: '919876543210',
                    id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUM0E0QkVGMkVCMUM0RDdBODg5ODAA',
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    text: {
                        body: 'This is a test reply to see if the webhook processes correctly.'
                    },
                    type: 'text'
                }]
            },
            field: 'messages'
        }]
    }]
};

async function testWebhook() {
    try {
        console.log("Sending payload...");
        const res = await axios.post('http://localhost:4000/api/social/webhook', payload);
        console.log("Response:", res.status, res.data);
    } catch (e) {
        console.error("Error:", e.response ? e.response.data : e.message);
    }
}

testWebhook();
