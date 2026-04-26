import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
        console.log('✅ Connected to MongoDB');

        const collections = ['Lead', 'Deal', 'Contact', 'Project', 'Activity', 'Conversation'];
        
        for (const col of collections) {
            try {
                // We need to define or get the model. 
                // Since we don't want to import everything, we can use the connection's collection directly.
                const count = await mongoose.connection.db.collection(col.toLowerCase() + 's').countDocuments();
                console.log(`${col}: ${count} documents`);
            } catch (e) {
                // Try pluralized or as is
                try {
                     const count = await mongoose.connection.db.collection(col).countDocuments();
                     console.log(`${col}: ${count} documents`);
                } catch (e2) {
                     console.log(`${col}: Error or Collection not found`);
                }
            }
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Connection Error:', err.message);
        process.exit(1);
    }
};

checkData();
