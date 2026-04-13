import axios from 'axios';

async function simulate() {
    try {
        const payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": "123456789",
                    "changes": [
                        {
                            "value": {
                                "messaging_product": "whatsapp",
                                "metadata": {
                                    "display_phone_number": "1234567890",
                                    "phone_number_id": "1117700221418284"
                                },
                                "contacts": [
                                    {
                                        "profile": { "name": "Test User" },
                                        "wa_id": "919958389355"
                                    }
                                ],
                                "messages": [
                                    {
                                        "from": "919958389355",
                                        "id": "ABGGjhR5YmZAAgo6Aw",
                                        "timestamp": Math.floor(Date.now() / 1000),
                                        "text": { "body": "Simulation: Hello from WhatsApp!" },
                                        "type": "text"
                                    }
                                ]
                            },
                            "field": "messages"
                        }
                    ]
                }
            ]
        };

        console.log('Sending simulation payload to http://localhost:4000/api/webhooks/whatsapp-live-bot');
        const res = await axios.post('http://localhost:4000/api/webhooks/whatsapp-live-bot', payload);
        console.log('Status Code:', res.status);
    } catch (err) {
        console.error('Simulation Failed:', err.response?.data || err.message);
    }
}

simulate();
