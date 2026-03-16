import 'dotenv/config';
import mongoose from 'mongoose';
import Contact from '../models/Contact.js';
import Activity from '../models/Activity.js';
import { googleSyncQueue } from '../src/queues/queueManager.js';

/**
 * Diagnostic script to test Google Sync integration
 */
const runDiagnostics = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Check if we have a test contact
        let contact = await Contact.findOne({ name: 'GoogleSyncTest' });
        if (!contact) {
            contact = await Contact.create({
                name: 'GoogleSyncTest',
                surname: 'User',
                phones: [{ number: '9999999999', type: 'Personal' }],
                emails: [{ address: 'sync.test@example.com', type: 'Personal' }]
            });
            console.log('✅ Created test contact');
        }

        // 2. Queue Sync Job
        console.log('🚀 Queuing sync job for contact:', contact._id);
        await googleSyncQueue.add('syncContact', { contactId: contact._id });
        console.log('✅ Sync job queued successfully');

        // 3. Create a test activity
        const activity = await Activity.create({
            type: 'Meeting',
            subject: 'Google Sync Test Meeting',
            dueDate: new Date(),
            dueTime: '10:00',
            description: 'Testing Google Calendar Sync',
            entityType: 'Contact',
            entityId: contact._id
        });
        console.log('✅ Created test activity:', activity._id);

        console.log('🚀 Queuing sync job for calendar event:', activity._id);
        await googleSyncQueue.add('syncEvent', { activityId: activity._id });
        console.log('✅ Calendar sync job queued successfully');

        console.log('\n--- DIAGNOSTICS COMPLETE ---');
        console.log('Please check your Google Contacts and Calendar for the synchronized data.');
        console.log('Also monitor backend logs/BullMQ for job execution status.');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Diagnostics failed:', error.message);
        process.exit(1);
    }
};

runDiagnostics();
