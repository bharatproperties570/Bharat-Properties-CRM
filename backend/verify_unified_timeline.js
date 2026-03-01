import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Activity from './models/Activity.js';
import Lead from './models/Lead.js';
import AuditLog from './models/AuditLog.js';

dotenv.config();

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';

async function test() {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        // 1. Find an activity to see what entities have them
        const sampleActivity = await Activity.findOne();
        let testLeadId = null;
        let testEntityType = 'lead';

        if (sampleActivity) {
            console.log(`Found activity for ${sampleActivity.entityType}: ${sampleActivity.entityId}`);
            testLeadId = sampleActivity.entityId;
            testEntityType = sampleActivity.entityType;
        } else {
            // If no activities, find a lead anyway
            const lead = await Lead.findOne();
            if (lead) {
                testLeadId = lead._id;
                console.log(`Using Lead ID: ${testLeadId}`);
            }
        }

        if (!testLeadId) {
            console.log('No data found to test');
            process.exit(0);
        }

        // 2. Mocking the API logic
        const activities = await Activity.find({
            entityId: testLeadId,
            entityType: { $regex: new RegExp(`^${testEntityType}$`, 'i') }
        }).lean();

        const auditLogs = await AuditLog.find({
            targetId: testLeadId,
            targetType: testEntityType.toLowerCase()
        }).lean();

        console.log(`Fetched ${activities.length} activities and ${auditLogs.length} audit logs`);

        const timeline = [
            ...activities.map(a => ({
                source: 'activity',
                type: (a.type || 'unknown').toLowerCase(),
                timestamp: a.completedAt || a.dueDate || a.createdAt,
                title: a.subject
            })),
            ...auditLogs.map(l => ({
                source: 'audit',
                type: 'system_log',
                timestamp: l.timestamp,
                title: l.description
            }))
        ];

        timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        console.log('Final Timeline Sample:');
        console.log(JSON.stringify(timeline.slice(0, 10), null, 2));

        await mongoose.disconnect();
        console.log('Disconnected');
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

test();
