import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// PROPERLY LOAD SYSTEM SETTING SCHEMA
import './src/modules/settings/systemSetting.model.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const WhatsAppService = (await import('./services/WhatsAppService.js')).default;
    const { sendWhatsAppMessage } = await import('./controllers/social.controller.js');
    
    // Force _getMetaConfig to work
    const config = await WhatsAppService._getMetaConfig();
    console.log('Config loaded?', !!config);

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
        json: (d) => console.log('RES JSON:', d) 
    };
    
    await sendWhatsAppMessage(mockReq, mockRes, () => {});
    process.exit(0);
}
run();
