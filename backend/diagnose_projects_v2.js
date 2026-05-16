
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const ProjectSchema = new mongoose.Schema({
    name: String,
    blocks: [{
        name: String
    }]
}, { strict: false });

const Project = mongoose.model('Project', ProjectSchema, 'projects');

async function diagnose() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected successfully.');

        console.log('\n--- Auditing Projects ---');
        const projects = await Project.find({});
        console.log(`Total projects found: ${projects.length}`);

        projects.forEach(p => {
            console.log(`\nProject: ${p.name}`);
            console.log(`ID: ${p._id}`);
            console.log(`Blocks: ${JSON.stringify(p.blocks || [])}`);
        });

        const kurukshetra = projects.find(p => p.name && p.name.includes('Sector 13 Kurukshetra'));
        if (kurukshetra) {
            console.log('\n--- Specific Focus: Sector 13 Kurukshetra ---');
            console.log(`Full Name: ${kurukshetra.name}`);
            console.log(`Blocks Count: ${kurukshetra.blocks ? kurukshetra.blocks.length : 0}`);
            if (kurukshetra.blocks) {
                kurukshetra.blocks.forEach((b, i) => {
                    console.log(`  Block ${i + 1}: ${b.name}`);
                });
            } else {
                console.log('  WARNING: blocks field is missing or null');
            }
        } else {
            console.log('\n--- WARNING: Sector 13 Kurukshetra NOT FOUND in database ---');
        }

        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    } catch (error) {
        console.error('Diagnosis failed:', error);
    }
}

diagnose();
