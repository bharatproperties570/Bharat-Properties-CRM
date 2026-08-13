import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FeedbackForm from './models/FeedbackForm.js';

dotenv.config();

const createForm = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
        console.log("Connected to MongoDB.");

        const siteVisitForm = {
            name: 'Post Site Visit Feedback',
            slug: 'post-site-visit-feedback-' + Date.now(), // Ensure uniqueness
            isActive: true,
            description: 'Automatically sent to clients after a site visit to gather their feedback on the properties they viewed.',
            settings: {
                successMessage: "Thank you for sharing your feedback! Our expert will get in touch with you shortly.",
                theme: { primaryColor: '#10b981', layout: 'single' },
                autoTags: ['Site Visit Feedback']
            },
            sections: [
                {
                    id: 'sec_1',
                    title: 'Your Site Visit Experience',
                    fields: [
                        {
                            id: 'field_rating',
                            label: 'How would you rate your overall site visit experience?',
                            type: 'rating',
                            required: true,
                            order: 0
                        },
                        {
                            id: 'field_property_feedback',
                            label: 'Property Specific Feedback',
                            type: 'property_feedback',
                            helpText: 'Please share your result for each property you visited today.',
                            required: true,
                            options: [
                                'Interested',
                                'Not Interested',
                                'Shortlisted',
                                'Booked',
                                'Budget Issue',
                                'Need Time'
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

        const form = new FeedbackForm(siteVisitForm);
        await form.save();
        console.log(`✅ Successfully created form: ${form.name}`);

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        mongoose.disconnect();
    }
};

createForm();
