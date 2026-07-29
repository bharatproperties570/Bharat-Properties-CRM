import mongoose from 'mongoose';
import dotenv from 'dotenv';
import WhatsAppService from './services/WhatsAppService.js';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

async function testSendTemplate() {
    console.log("Fetching templates...");
    try {
        const templates = await WhatsAppService.getTemplates();
        const template = templates.find(t => t.name === 'property_match_default');
        
        console.log(`Attempting to send template: ${template.name}`);
        console.log("Template components def:", JSON.stringify(template.components, null, 2));
        
        // Let's pass 1 parameter, then 2 parameters, to see what works
        const components1 = [{ type: 'body', parameters: [{ type: 'text', text: 'Param1' }] }];
        const components2 = [{ type: 'body', parameters: [{ type: 'text', text: 'Param1' }, { type: 'text', text: 'Param2' }] }];
        const components3 = [{ type: 'body', parameters: [{ type: 'text', text: 'Param1' }, { type: 'text', text: 'Param2' }, { type: 'text', text: 'Param3' }] }];

        console.log("Trying 1 parameter...");
        let res = await WhatsAppService.sendTemplate('919876543210', template.name, template.language, components1);
        console.log("1 param res:", res);

        console.log("Trying 2 parameters...");
        res = await WhatsAppService.sendTemplate('919876543210', template.name, template.language, components2);
        console.log("2 param res:", res);

        console.log("Trying 3 parameters...");
        res = await WhatsAppService.sendTemplate('919876543210', template.name, template.language, components3);
        console.log("3 param res:", res);

    } catch (e) {
        console.error("Caught error:", e);
    }
    process.exit(0);
}

// Wait for connection
mongoose.connection.once('open', () => {
    testSendTemplate();
});
