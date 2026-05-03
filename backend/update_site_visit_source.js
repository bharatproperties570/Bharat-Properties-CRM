
import mongoose from 'mongoose';
import DynamicForm from './models/DynamicForm.js';
import dotenv from 'dotenv';

dotenv.config();

const updateSiteVisitForm = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const form = await DynamicForm.findOne({ category: 'site_visit' });
        if (!form) {
            console.log('Site visit form not found.');
            process.exit(0);
        }

        // Find the project field and update its source
        form.sections.forEach(section => {
            section.fields.forEach(field => {
                if (field.label.toLowerCase().includes('project')) {
                    field.dynamicSource = 'projects';
                    field.options = []; // Clear mock options
                }
            });
        });

        await form.save();
        console.log('✅ Site Visit Form Updated with Dynamic Project Source');
        process.exit(0);
    } catch (error) {
        console.error('Error updating site visit form:', error);
        process.exit(1);
    }
};

updateSiteVisitForm();
