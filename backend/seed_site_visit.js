
import mongoose from 'mongoose';
import DynamicForm from './models/DynamicForm.js';
import dotenv from 'dotenv';
import slugify from 'slugify';

dotenv.config();

const seedSiteVisitForm = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const existing = await DynamicForm.findOne({ category: 'site_visit' });
        if (existing) {
            console.log('Site visit form already exists.');
            process.exit(0);
        }

        const name = "Standard Project Tour Scheduler";
        const slug = slugify(name, { lower: true, strict: true }) + "-" + Math.random().toString(36).substring(2, 7);

        const siteVisitForm = new DynamicForm({
            name,
            slug,
            category: 'site_visit',
            description: 'Professional booking form for project site visits and property tours.',
            sections: [
                {
                    id: 'sec_visitor_info',
                    title: 'Visitor Details',
                    fields: [
                        { id: 'f_name', label: 'Full Name', type: 'text', required: true, placeholder: 'Enter your full name' },
                        { id: 'f_phone', label: 'Phone Number', type: 'phone', required: true, placeholder: 'Best number to reach you' },
                        { id: 'f_email', label: 'Email Address', type: 'email', required: false, placeholder: 'For booking confirmation' }
                    ]
                },
                {
                    id: 'sec_visit_details',
                    title: 'Tour Schedule',
                    fields: [
                        { id: 'f_project', label: 'Project / Property', type: 'select', required: true, options: ['Project A', 'Project B', 'General Inquiry'] },
                        { id: 'f_date', label: 'Preferred Date', type: 'date', required: true },
                        { id: 'f_time', label: 'Preferred Time Slot', type: 'select', required: true, options: ['Morning (10 AM - 1 PM)', 'Afternoon (1 PM - 4 PM)', 'Evening (4 PM - 7 PM)'] }
                    ]
                },
                {
                    id: 'sec_requirements',
                    title: 'Additional Preferences',
                    fields: [
                        { id: 'f_notes', label: 'Specific Requirements', type: 'text', required: false, placeholder: 'Any specific unit or detail you want to see?' }
                    ]
                }
            ],
            settings: {
                successMessage: 'Thank you! Your site visit has been scheduled. Our relationship manager will contact you shortly to confirm the details.',
                primaryColor: '#ec4899',
                layout: 'multi-step'
            },
            isActive: true
        });

        await siteVisitForm.save();
        console.log('✅ Professional Site Visit Form Seeded Successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding site visit form:', error);
        process.exit(1);
    }
};

seedSiteVisitForm();
