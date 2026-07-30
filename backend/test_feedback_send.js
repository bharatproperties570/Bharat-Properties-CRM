import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import './src/modules/systemSettings/system.model.js';
import WhatsAppService from './services/WhatsAppService.js';

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        // Mock payload mimicking InventoryFeedbackModal -> Dispatcher -> Controller
        // I won't pass the FLOW button manually, let's see if the controller adds it from templateDef
        // Oh wait, WhatsAppService.sendTemplate doesn't build components, it just passes them to Meta.
        // The building of components is in social.controller.js !
        
        // To test social.controller.js logic, I have to mock req and res and call sendWhatsAppMessage
        const { sendWhatsAppMessage } = await import('./controllers/social.controller.js');
        
        const req = {
            body: {
                mobile: "918221808000",
                templateId: "property_owner_feedback",
                language: "en",
                headerImageUrl: "https://files.catbox.moe/axqhoi.png",
                templateComponents: [
                    { type: "text", parameter_name: "ownername", text: "Rishi" },
                    { type: "text", parameter_name: "employeename", text: "Agent" },
                    { type: "text", parameter_name: "subcategory", text: "Plot" },
                    { type: "text", parameter_name: "unitnumber", text: "101" },
                    { type: "text", parameter_name: "projectname", text: "Sec 2" },
                    { type: "text", parameter_name: "discussionsummary", text: "Not Interested" },
                    { type: "text", parameter_name: "agent_mobile", text: "9991333570" }
                ]
            }
        };
        const res = {
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) { console.log("Response:", data); return data; }
        };
        
        await sendWhatsAppMessage(req, res);
        
        process.exit(0);
    } catch (err) {
        console.error("Fatal:", err);
        process.exit(1);
    }
};

run();
