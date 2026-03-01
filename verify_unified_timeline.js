import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Activity from './backend/models/Activity.js';
import Lead from './backend/models/Lead.js';
import AuditLog from './backend/models/AuditLog.js';

dotenv.config();

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';

async function test() {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        // 1. Find a lead
        const lead = await Lead.findOne();
        if (!lead) {
            console.log('No leads found to test');
            process.exit(0);
        }
        console.log(`Testing with Lead ID: ${lead._id}`);

        // 2. Check activities
        const activities = await Activity.find({ entityId: lead._id });
        console.log(`Found ${activities.length} activities for this lead`);

        // 3. Check audit logs
        const auditLogs = await AuditLog.find({ targetId: lead._id, targetType: 'lead' });
        console.log(`Found ${auditLogs.length} audit logs for this lead`);

        // 4. Manually trigger the logic from the controller (since we can't easily call the route in this environment)
        const timeline = [
            ...activities.map(a => ({
                _id: a._id,
                source: 'activity',
                type: a.type.toLowerCase(),
                timestamp: a.completedAt || a.dueDate || a.createdAt,
                title: a.subject,
                description: a.description,
                status: a.status
            })),
            ...auditLogs.map(l => ({
                _id: l._id,
                source: 'audit',
                type: 'system_log',
                timestamp: l.timestamp,
                title: l.description,
                description: l.eventType
            }))
        ];

        timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        console.log('Combined Timeline Sample (First 5):');
        console.log(JSON.stringify(timeline.slice(0, 5), null, 2));

        await mongoose.disconnect();
        console.log('Disconnected');
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

test();
