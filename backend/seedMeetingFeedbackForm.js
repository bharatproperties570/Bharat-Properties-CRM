import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FeedbackForm from './models/FeedbackForm.js';

dotenv.config();

const createForm = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
        console.log("Connected to MongoDB.");

        const meetingForm = {
            name: 'Post Meeting Feedback',
            slug: 'post-meeting-feedback-1786672843225', 
            isActive: true,
            description: 'Automatically sent to clients after a meeting to gather their feedback.',
            settings: {
                successMessage: "Thank you for sharing your feedback! Our expert will get in touch with you shortly.",
                theme: { primaryColor: '#3b82f6', layout: 'single' },
                autoTags: ['Meeting Feedback']
            },
            sections: [
                {
                    id: 'sec_1',
                    title: 'Your Meeting Experience',
                    fields: [
                        {
                            id: 'field_rating',
                            label: 'How would you rate your overall meeting experience?',
                            type: 'rating',
                            required: true,
                            order: 0
                        },
                        {
                            id: 'field_outcome',
                            label: 'Meeting Outcome',
                            type: 'dropdown',
                            helpText: 'Please share the result of this meeting.',
                            required: true,
                            options: [
                                'Successful - Proceeding to Next Steps',
                                'Follow Up Required',
                                'Client Needs Time',
                                'Not Interested / Closed Lost'
                            ],
                            order: 1
                        },
                        {
                            id: 'field_comments',
                            label: 'Any additional comments or requirements?',
                            type: 'text',
                            required: false,
                            order: 2
                        }
                    ]
                }
            ]
        };

        const form = new FeedbackForm(meetingForm);
        await form.save();
        console.log(`✅ Successfully created form: ${form.name}`);

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        mongoose.disconnect();
    }
};

createForm();
