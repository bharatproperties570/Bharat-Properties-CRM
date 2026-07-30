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
        
        const components = [
            { type: "header", parameters: [{ type: "image", image: { link: "https://files.catbox.moe/axqhoi.png" } }] },
            { type: "body", parameters: [
                { type: "text", parameter_name: "ownername", text: "Rishi" },
                { type: "text", parameter_name: "employeename", text: "Agent" },
                { type: "text", parameter_name: "subcategory", text: "Plot" },
                { type: "text", parameter_name: "unitnumber", text: "101" },
                { type: "text", parameter_name: "projectname", text: "Sec 2" },
                { type: "text", parameter_name: "discussionsummary", text: "Not Interested" },
                { type: "text", parameter_name: "agent_mobile", text: "9991333570" }
            ]},
            { type: "button", sub_type: "flow", index: "0", parameters: [
                { type: "action", action: { flow_token: "test_token_123" } }
            ]}
        ];
        
        const result = await WhatsAppService.sendTemplate("918221808000", "property_owner_feedback", "en", components);
        
        console.log("Send Result:", JSON.stringify(result, null, 2));
        process.exit(0);
    } catch (err) {
        console.error("Fatal:", err);
        process.exit(1);
    }
};

run();
