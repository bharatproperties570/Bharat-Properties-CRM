import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
        console.log('✅ Connected to MongoDB');

        const mappings = {
            'Lead': 'leads',
            'Deal': 'deals',
            'Contact': 'contacts',
            'Project': 'projects',
            'Activity': 'activities',
            'Conversation': 'conversations'
        };
        
        for (const name in mappings) {
             const col = mappings[name];
             const count = await mongoose.connection.db.collection(col).countDocuments();
             console.log(`${name} (${col}): ${count} documents`);
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Connection Error:', err.message);
        process.exit(1);
    }
};

checkData();
