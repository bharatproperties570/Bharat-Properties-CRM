import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from './backend/models/Project.js';
import Lookup from './backend/models/Lookup.js';

dotenv.config({ path: './backend/.env' });

async function diagnose() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const projects = await mongoose.connection.db.collection('projects').find({}).toArray();
        console.log(`Found ${projects.length} projects`);

        if (projects.length === 0) {
            console.log('No projects found');
            process.exit(0);
        }

        const project = projects[0];
        console.log('Sample Project:', JSON.stringify(project, null, 2));

        const fieldsToCheck = ['category', 'subCategory', 'status', 'parkingType', 'unitType'];

        projects.forEach((p, idx) => {
            console.log(`\nProject ${idx + 1}: ${p.name}`);
            fieldsToCheck.forEach(field => {
                const val = p[field];
                console.log(`${field}: ${JSON.stringify(val)} (${typeof val})`);

                if (Array.isArray(val)) {
                    val.forEach((v, i) => {
                        if (v && !mongoose.Types.ObjectId.isValid(v)) {
                            console.log(`  !! INVALID ID in ${field}[${i}]: ${v}`);
                        }
                    });
                } else if (val && !mongoose.Types.ObjectId.isValid(val)) {
                    console.log(`  !! INVALID ID in ${field}: ${val}`);
                }
            });
        });

        process.exit(0);
    } catch (err) {
        console.error('Diagnosis failed:', err);
        process.exit(1);
    }
}

diagnose();
