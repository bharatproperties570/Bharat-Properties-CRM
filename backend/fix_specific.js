import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import Lead from './models/Lead.js';
import Conversation from './models/Conversation.js';
import Activity from './models/Activity.js';

async function fixSpecific() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const lead = await Lead.findOne({ mobile: '7015732396' });
        if (!lead) {
            console.log('Lead not found');
            process.exit(0);
        }

        const messageText = 'वेद, पुराण पढ़ो। यह सब ज्ञान उन्हीं से लिया है। ज्ञानी जी ने कहा कि जब भूख लगती है तो भोजन खाते हैं।';
        const fromNumber = '7015732396';

        let conversation = await Conversation.findOne({ phoneNumber: fromNumber, status: 'active' });
        if (!conversation) {
            conversation = new Conversation({
                phoneNumber: fromNumber,
                lead: lead._id,
                channel: 'whatsapp',
                status: 'active',
                messages: [],
                metadata: {
                    entityType: 'Lead',
                    entityId: lead._id
                }
            });
        }
        
        conversation.messages.push({
            role: 'user',
            content: messageText,
            timestamp: lead.createdAt
        });

        await conversation.save();
        console.log('Conversation saved!');

        const activity = await Activity.create({
            type: 'WhatsApp',
            subject: 'Incoming WhatsApp Message',
            description: messageText,
            status: 'Completed',
            performedBy: 'System',
            dueDate: new Date(),
            entityType: 'Lead',
            entityId: lead._id,
            participants: [{ name: lead.firstName || 'Unknown', mobile: fromNumber }],
            details: {
                direction: 'inbound',
                phoneNumber: fromNumber,
                platform: 'whatsapp',
                isMatched: true
            },
            metadata: {
                from: fromNumber
            }
        });

        console.log('Activity saved!', activity._id);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
fixSpecific();
