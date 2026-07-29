import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import waService from './services/WhatsAppService.js';
import './models/SystemSetting.js';

const testSend = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1');
        const components = [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: 'Test Broker' },
                    { type: 'text', text: 'A-101\nSuper Project\n\n1200 Sq.Ft.\nN/A\nN/A\nN/A\nN/A\n\nhttps://maps.google.com/?q=28,77\n\n💰 *Expected Price* ₹1.50 Cr\n\n---------------------------\n\nA-102\nSuper Project 2\n\n1200 Sq.Ft.\nN/A\nN/A\nN/A\nN/A\n\nhttps://maps.google.com/?q=28,77\n\n💰 *Expected Price* ₹1.50 Cr' }
                ]
            }
        ];
        
        console.log("Sending...");
        const res = await waService.sendTemplate('918529688461', 'property_match_short_detail_3', 'en_US', components);
        console.log("Result:", res);
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
};

testSend();
