import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getVisibilityFilter } from '../backend/utils/visibility.js';
import Lead from '../backend/models/Lead.js';
import Conversation from '../backend/models/Conversation.js';
import Activity from '../backend/models/Activity.js';
import AuditLog from '../backend/models/AuditLog.js';
import Contact from '../backend/models/Contact.js';
import Deal from '../backend/models/Deal.js';

dotenv.config({ path: './backend/.env' });

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const entityId = '69dd163a5b9db6372a16ca0d'; // The simulated Lead ID
        const entityType = 'lead';
        const objId = new mongoose.Types.ObjectId(entityId);

        // 1. Fetch Conversations (The query we fixed)
        const conversationQuery = {
            $or: [
                { lead: objId },
                { 'metadata.entityId': objId },
                { 'metadata.entityId': entityId },
                { 'metadata.entityId': objId.toString() }
            ],
            channel: 'whatsapp'
        };

        const conversations = await Conversation.find(conversationQuery).lean();
        console.log(`Found ${conversations.length} conversations`);
        
        if (conversations.length > 0) {
            console.log('Messages in first conv:', conversations[0].messages.length);
        }

        // 2. Fetch Activities
        const activities = await Activity.find({
            entityId: objId,
            type: 'WhatsApp'
        }).lean();
        console.log(`Found ${activities.length} WhatsApp Activities`);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

test();
