
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';

dotenv.config({ path: 'backend/.env' });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // This should fail if `type` is not escaped
        const mockProject = {
            name: "Test Project With Type " + Date.now(),
            projectVideos: [
                { title: 'Video 1', type: 'YouTube', url: 'http://youtube.com' }
            ],
            pricing: {
                paymentPlans: [
                    { name: 'Plan A', type: 'CLP', milestones: [] }
                ]
            }
        };

        console.log("Attempting to create project with 'type' fields...");
        const project = await Project.create(mockProject);
        console.log("Project created successfully:", project._id);

    } catch (error) {
        console.error("Error creating project:", error.message);
        if (error.errors) {
            Object.keys(error.errors).forEach(key => {
                console.error(`Field ${key}: ${error.errors[key].message}`);
            });
        }
    } finally {
        await mongoose.disconnect();
    }
};

run();
