import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const ActivitySchema = new mongoose.Schema({
    type: String,
    subject: String,
    entityType: String,
    entityId: mongoose.Schema.Types.ObjectId,
    participants: [{ name: String, mobile: String, email: String }],
    dueDate: Date,
    status: String,
    description: String,
    details: mongoose.Schema.Types.Mixed,
    assignedTo: mongoose.Schema.Types.ObjectId,
    performedBy: String,
    performedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Activity = mongoose.models.Activity || mongoose.model("Activity", ActivitySchema);

async function seedActivities() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Clear existing mock activities if any (optional)
        // await Activity.deleteMany({ performedBy: 'System Seeder' });

        const activities = [
            // Emails
            {
                type: 'Email',
                subject: 'Project Inquiry - Sunita Verma',
                entityType: 'Lead',
                entityId: new mongoose.Types.ObjectId(), // Placeholder
                participants: [{ name: 'Sunita Verma', email: 'sunita.v@gmail.com' }],
                dueDate: new Date(),
                status: 'Completed',
                description: 'Inquired about the latest project orientation.',
                details: { outcome: 'Interested', platform: 'Gmail', direction: 'Incoming' },
                performedBy: 'System Seeder'
            },
            {
                type: 'Email',
                subject: 'Follow-up: Deepak Sharma',
                entityType: 'Lead',
                entityId: new mongoose.Types.ObjectId(),
                participants: [{ name: 'Deepak Sharma', email: 'deepak.s@outlook.com' }],
                dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
                status: 'Completed',
                description: 'Sent follow-up email regarding the pricing.',
                details: { outcome: 'Read', platform: 'Outlook', direction: 'Outgoing' },
                performedBy: 'System Seeder'
            },
            // Calls
            {
                type: 'Call',
                subject: 'Outgoing Call: Subhash Chander',
                entityType: 'Lead',
                entityId: new mongoose.Types.ObjectId(),
                participants: [{ name: 'Subhash Chander', mobile: '9876543210' }],
                dueDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
                status: 'Completed',
                description: 'Discussed project timeline.',
                details: { outcome: 'Not Interested', platform: 'WhatsApp Call', duration: '00:00:03', direction: 'Outgoing' },
                performedBy: 'System Seeder'
            },
            {
                type: 'Call',
                subject: 'Incoming Call: Rajesh Kumar',
                entityType: 'Lead',
                entityId: new mongoose.Types.ObjectId(),
                participants: [{ name: 'Rajesh Kumar', mobile: '9123456789' }],
                dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
                status: 'Completed',
                description: 'Called to check unit availability.',
                details: { outcome: 'Interested', platform: 'GSM Call', duration: '00:05:23', direction: 'Incoming' },
                performedBy: 'System Seeder'
            },
            // Messaging
            {
                type: 'Messaging',
                subject: 'WhatsApp Message: Amit Verma',
                entityType: 'Lead',
                entityId: new mongoose.Types.ObjectId(),
                participants: [{ name: 'Amit Verma', mobile: '8877665544' }],
                dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
                status: 'Completed',
                description: 'Sent brochure on WhatsApp.',
                details: { outcome: 'Delivered', platform: 'WhatsApp', direction: 'Outgoing' },
                performedBy: 'System Seeder'
            }
        ];

        await Activity.insertMany(activities);
        console.log('Sample communication activities seeded successfully');

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error seeding activities:', error);
        process.exit(1);
    }
}

seedActivities();
