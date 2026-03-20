import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

const dummyPatterns = [
    'unsplash.com',
    'pixabay.com',
    'placeholder.jpg',
    'placeholder.png',
    'dummyimage.com'
];

async function cleanup() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const projectsCol = db.collection('projects');
        const dealsCol = db.collection('deals');

        let projectCount = 0;
        let dealCount = 0;

        // 1. Cleanup Projects
        const projects = await projectsCol.find({}).toArray();
        for (const project of projects) {
            const featuredImage = project.websiteMetadata?.featuredImage;
            if (featuredImage && dummyPatterns.some(pattern => featuredImage.includes(pattern))) {
                console.log(`Cleaning project: ${project.name} (${featuredImage})`);
                await projectsCol.updateOne(
                    { _id: project._id },
                    { $set: { 'websiteMetadata.featuredImage': null } }
                );
                projectCount++;
            }
        }

        // 2. Cleanup Deals
        const deals = await dealsCol.find({}).toArray();
        for (const deal of deals) {
            const featuredImage = deal.websiteMetadata?.featuredImage;
            if (featuredImage && dummyPatterns.some(pattern => featuredImage.includes(pattern))) {
                console.log(`Cleaning deal: ${deal.projectName} - ${deal.unitNo} (${featuredImage})`);
                await dealsCol.updateOne(
                    { _id: deal._id },
                    { $set: { 'websiteMetadata.featuredImage': null } }
                );
                dealCount++;
            }
        }

        console.log(`\nCleanup Complete!`);
        console.log(`Projects updated: ${projectCount}`);
        console.log(`Deals updated: ${dealCount}`);

        process.exit(0);
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

cleanup();
