import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-crm';

const run = async () => {
    try {
        console.log('Connecting to DB:', MONGODB_URI);
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');

        const SystemSetting = mongoose.connection.db.collection('systemsettings');
        
        // 1. Fetch existing rules
        const setting = await SystemSetting.findOne({ key: 'unified_automation_rules' });
        let rules = setting ? setting.value : {};

        // 2. Define Feedback Received Rule
        const feedbackRule = {
            enabled: true,
            description: "Triggered when a customer submits a feedback form",
            targetStatus: "Qualified", // Automatically move to Qualified after feedback
            whatsapp: {
                enabled: true,
                templateName: "feedback_acknowledgment",
                body: "Hello {{firstName}}, thank you for your valuable feedback! 🌟 We've received your responses and our team will review them to improve our services for you. - Team Bharat Properties"
            },
            sms: {
                enabled: true,
                body: "Hello {{firstName}}, thank you for your feedback. We have received it and our team will review it shortly to serve you better. - Bharat Properties",
                dltId: "1207161520123456789"
            },
            email: {
                enabled: true,
                subject: "Thank You for Your Feedback! | Bharat Properties",
                body: "Hello {{firstName}},\n\nThank you for taking the time to share your feedback with us. It truly helps us improve and provide a better experience for you.\n\nWe have successfully received your submission. Our team will review your responses and get back to you if any action is needed. We appreciate your trust in Bharat Properties.\n\nWarm Regards,\nCustomer Excellence Team\nBharat Properties"
            }
        };

        // 3. Merge into rules
        rules['onFeedbackReceived'] = feedbackRule;

        // 4. Save back to DB
        await SystemSetting.updateOne(
            { key: 'unified_automation_rules' },
            { 
                $set: { 
                    value: rules,
                    updatedAt: new Date()
                } 
            },
            { upsert: true }
        );

        console.log('✅ Successfully updated unified_automation_rules with onFeedbackReceived');

        // 5. Also ensure the "Feedback Received" SMS template exists for DLT compliance if needed
        const SmsTemplate = mongoose.connection.db.collection('smstemplates');
        await SmsTemplate.updateOne(
            { name: 'Feedback Acknowledgment' },
            {
                $set: {
                    name: 'Feedback Acknowledgment',
                    body: "Hello {{Name}}, thank you for your feedback. We have received it and our team will review it shortly. - Bharat Properties",
                    category: 'Transactional',
                    dltTemplateId: '1207161520123456789', // Example DLT ID
                    isActive: true,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );
        console.log('✅ Successfully ensured Feedback SMS Template exists.');

    } catch (error) {
        console.error('Error seeding rules:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

run();
