import axios from 'axios';
const token = 'EAAQYCQScYfgBR6GYNyheiKkbbmakDxVifCBJDIXWdQi0d5XH1DF2wUDO0Lp3bdlZAtlvymc3U2Nznf8VAGadxByrh51B2lGxvoGF9aZCz80PEXZCuhAPVMYxGELgLyjyYkzZCLcxWlBYZARAuyDnggfdB4udbb9yiY8CtCRji9V4TP6LYREMZBZAJ974b8uvZBQRKwZDZD';
const phoneId = '1117700221418284';

const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '919416035570',
    type: 'template',
    template: {
        name: 'welcome_lead',
        language: { code: 'en' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: 'Kishan', parameter_name: 'full_name' },
                    { type: 'text', text: 'Buy', parameter_name: 'intent' },
                    { type: 'text', text: '10 Marla', parameter_name: 'property_size' },
                    { type: 'text', text: 'Plot', parameter_name: 'property_subcategory' },
                    { type: 'text', text: 'Collector Rate', parameter_name: 'transaction_type' },
                    { type: 'text', text: 'Sector 4', parameter_name: 'preferred_area' },
                    { type: 'text', text: 'Kurukshetra', parameter_name: 'preferred_city' },
                    { type: 'text', text: '2.50 Cr.', parameter_name: 'budget_max' },
                    { type: 'text', text: 'Suraj', parameter_name: 'agent_name' },
                    { type: 'text', text: '999133', parameter_name: 'agent_mobile' }
                ]
            },
            {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: 'visit' }]
            },
            {
                type: 'button',
                sub_type: 'url',
                index: '1',
                parameters: [{ type: 'text', text: 'visit' }]
            }
        ]
    }
};

async function run() {
    try {
        const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
        const res = await axios.post(url, payload, { headers: { 'Authorization': `Bearer ${token}` }});
        console.log('SUCCESS:', JSON.stringify(res.data, null, 2));
    } catch(e) {
        console.error('ERROR:', JSON.stringify(e.response?.data, null, 2) || e.message);
    }
}
run();
