import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";

async function run() {
    try {
        await mongoose.connect(uri);
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const user = await User.findOne({ name: /Suraj Keshwar/i });
        console.log('User:', JSON.stringify(user, null, 2));

        const Contact = mongoose.model('Contact', new mongoose.Schema({}, { strict: false }));
        const ramKumar = await Contact.findOne({ name: /Ram Kumar/i });
        console.log('Contact Ram Kumar:', JSON.stringify(ramKumar, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
