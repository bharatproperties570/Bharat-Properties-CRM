import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Load the CORRECT production model
import './src/modules/systemSettings/system.model.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const WhatsAppService = (await import('./services/WhatsAppService.js')).default;
    const { sendWhatsAppMessage } = await import('./controllers/social.controller.js');
    
    // Test if we get real templates now
    const templates = await WhatsAppService.getTemplates();
    console.log('Real templates found:', templates.length);

    const mockReq = {
        user: { companyId: 'dummy' },
        body: {
            mobile: '9416035570',
            message: 'welcome_lead',
            type: 'template',
            templateId: 'welcome_lead',
            templateComponents: [
                { parameter_name: 'full_name', text: 'Kishan' },
                { parameter_name: 'intent', text: 'Buy' },
                { parameter_name: 'property_size', text: '10 Marla' },
                { parameter_name: 'property_subcategory', text: 'Plot' },
                { parameter_name: 'transaction_type', text: 'Collector Rate' },
                { parameter_name: 'preferred_area', text: 'Sector 4' },
                { parameter_name: 'preferred_city', text: 'Kurukshetra' },
                { parameter_name: 'budget_max', text: '2.50 Cr.' },
                { parameter_name: 'agent_name', text: 'Suraj' },
                { parameter_name: 'agent_mobile', text: '99913' },
            ]
        }
    };
    
    const mockRes = { 
        status: (c) => ({ json: (d) => console.log('RES:', c, d) }), 
        json: (d) => console.log('RES JSON:', JSON.stringify(d, null, 2)) 
    };
    
    await sendWhatsAppMessage(mockReq, mockRes, () => {});
    process.exit(0);
}
run();
