import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

import Activity from './models/Activity.js';
import Conversation from './models/Conversation.js';

const fixData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // Fix Conversations without lead/contact refs but with metadata.entityId
        const convos = await Conversation.find({ lead: null, contact: null, 'metadata.entityId': { $ne: null } });
        console.log(`Found ${convos.length} conversations to fix`);
        
        for (const c of convos) {
            const eType = c.metadata?.entityType || c.entityType;
            const eId = c.metadata?.entityId || c.entityId;
            
            if (eType === 'Lead') {
                c.lead = eId;
            } else if (eType === 'Contact') {
                c.contact = eId;
            }
            
            c.channel = 'whatsapp';
            await c.save();
            console.log(`Fixed conversation ${c._id}`);
        }

        // Fix Activities without details.phoneNumber
        const activities = await Activity.find({ type: 'WhatsApp', 'details.phoneNumber': { $exists: false } });
        console.log(`Found ${activities.length} activities to fix`);

        for (const a of activities) {
            const mobile = a.metadata?.from;
            if (mobile) {
                a.details = {
                    ...a.details,
                    direction: 'inbound',
                    phoneNumber: mobile,
                    platform: 'whatsapp',
                    isMatched: !!a.entityId
                };
                
                if (!a.participants || a.participants.length === 0) {
                    a.participants = [{ name: 'Unknown', mobile: mobile }];
                }
                
                await a.save();
                console.log(`Fixed activity ${a._id}`);
            }
        }

        console.log('Done fixing data');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

fixData();
