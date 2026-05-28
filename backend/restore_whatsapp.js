import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import Lead from './models/Lead.js';
import Conversation from './models/Conversation.js';
import Activity from './models/Activity.js';

async function restoreMissingWhatsAppMessages() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // Find leads created by WhatsApp bot
        const leads = await Lead.find({
            description: { $regex: /^Auto-created from inbound WhatsApp message:/ }
        });

        console.log(`Found ${leads.length} leads created from WhatsApp inbound messages.`);

        let restoredCount = 0;

        for (const lead of leads) {
            const messagePrefix = 'Auto-created from inbound WhatsApp message: ';
            let messageText = lead.description.substring(messagePrefix.length).trim();
            const fromNumber = lead.mobile;

            // Check if Conversation exists
            let conversation = await Conversation.findOne({ 
                $or: [
                    { phoneNumber: fromNumber },
                    { lead: lead._id }
                ]
            });

            if (!conversation) {
                // Restore Conversation
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
                
                conversation.messages.push({
                    role: 'user',
                    content: messageText,
                    timestamp: lead.createdAt
                });

                await conversation.save();

                // Restore Activity
                await Activity.create({
                    type: 'WhatsApp',
                    subject: 'Incoming WhatsApp Message',
                    description: messageText,
                    status: 'Completed',
                    performedBy: 'System',
                    assignedTo: lead.assignment?.assignedTo || lead.owner || null,
                    dueDate: lead.createdAt,
                    createdAt: lead.createdAt,
                    entityType: 'Lead',
                    entityId: lead._id,
                    participants: [{ name: lead.fullName || lead.firstName || 'Unknown', mobile: fromNumber }],
                    details: {
                        direction: 'inbound',
                        phoneNumber: fromNumber,
                        platform: 'whatsapp',
                        isMatched: true
                    },
                    metadata: {
                        from: fromNumber,
                        restoredByScript: true
                    }
                });

                restoredCount++;
                console.log(`Restored message for lead ${fromNumber}: ${messageText.substring(0, 30)}...`);
            }
        }

        console.log(`Successfully restored messages for ${restoredCount} leads!`);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

restoreMissingWhatsAppMessages();
