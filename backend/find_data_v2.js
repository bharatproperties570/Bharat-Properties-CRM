import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";

async function run() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;

        // Find users
        const users = await db.collection('users').find({ $or: [{ fullName: /Suraj/i }, { name: /Suraj/i }, { email: /suraj/i }] }).toArray();
        console.log('Users found:', JSON.stringify(users, null, 2));

        // Find contacts
        const contacts = await db.collection('contacts').find({ $or: [{ name: /Ram Kumar/i }, { name: /Ram/i }] }).sort({createdAt: -1}).limit(5).toArray();
        console.log('Contacts found:', JSON.stringify(contacts, null, 2));

        // Let's also check Teams if possible
        const teams = await db.collection('teams').find({}).toArray();
        console.log('Teams found (count):', teams.length);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
