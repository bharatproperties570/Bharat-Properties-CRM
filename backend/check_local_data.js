
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        console.log('Collections:', collectionNames);

        if (collectionNames.includes('dealforms')) {
            const dealForms = await mongoose.connection.db.collection('dealforms').find({}).toArray();
            console.log(`Found ${dealForms.length} Deal Forms`);
            dealForms.forEach(f => console.log(` - ${f.name} (${f.slug})` || ` - ${f._id}`));
        } else {
            console.log('❌ dealforms collection not found');
        }

        if (collectionNames.includes('leads')) {
            const leadsCount = await mongoose.connection.db.collection('leads').countDocuments();
            console.log(`Total Leads: ${leadsCount}`);
        }

        if (collectionNames.includes('projects')) {
            const projectsCount = await mongoose.connection.db.collection('projects').countDocuments();
            console.log(`Total Projects: ${projectsCount}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

checkData();
