import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';
const ID_TO_CHECK = '699bc99fee5159cfdb8f2e29';

async function checkId() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const collections = await mongoose.connection.db.listCollections().toArray();

        for (const colInfo of collections) {
            const collection = mongoose.connection.db.collection(colInfo.name);
            const doc = await collection.findOne({ _id: new mongoose.Types.ObjectId(ID_TO_CHECK) });

            if (doc) {
                console.log(`\n[FOUND] In collection: ${colInfo.name}`);
                console.log('Document:', JSON.stringify(doc, null, 2));
                return;
            }
        }

        console.log(`\n[NOT FOUND] ID ${ID_TO_CHECK} not found in any collection.`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkId();
