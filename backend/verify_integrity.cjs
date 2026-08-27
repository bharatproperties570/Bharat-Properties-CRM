const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function check() {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const contact = await db.collection('contacts').findOne({ _id: new mongoose.Types.ObjectId('6991aadff605d312f40fd1a8') });
    console.log(JSON.stringify(contact, null, 2));
    process.exit(0);
}
check().catch(console.error);
