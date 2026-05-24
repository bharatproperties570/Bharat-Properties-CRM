const fs = require('fs');
const file = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/SendMessageModal.jsx';
let data = fs.readFileSync(file, 'utf8');

const mockSms = `
            if (!res.data || res.data.length === 0) {
                setSmsTemplates([
                    { _id: 'mock_sms_1', name: 'Welcome Message', body: 'Hi {{Name}}, welcome to Bharat Properties! Let us know if you need any help.' },
                    { _id: 'mock_sms_2', name: 'Follow-up', body: 'Hi {{Name}}, just following up regarding your property inquiry. Please call us back.' }
                ]);
            } else {
                setSmsTemplates(res.data);
            }
`;

const mockWa = `
            if (!res.templates || res.templates.length === 0) {
                setWhatsappTemplates([
                    { id: 'mock_wa_1', name: 'property_offer', language: 'en_US', body: 'Hello {{Name}}, we have an exclusive offer on {{projectName}}. Reply YES to know more.' },
                    { id: 'mock_wa_2', name: 'meeting_reminder', language: 'en_US', body: 'Hi {{Name}}, a gentle reminder for your site visit today.' }
                ]);
            } else {
                setWhatsappTemplates(res.templates);
            }
`;

data = data.replace(/setSmsTemplates\(res\.data\);/, mockSms);
data = data.replace(/setWhatsappTemplates\(res\.templates \|\| \[\]\);/, mockWa);

fs.writeFileSync(file, data);
