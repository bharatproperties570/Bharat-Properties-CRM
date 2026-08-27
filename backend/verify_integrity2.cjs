const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function check() {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const deal = await db.collection('deals').findOne({ _id: new mongoose.Types.ObjectId('6a14487e832f102d5b5247ab') });
    console.log(JSON.stringify(deal, null, 2));
    process.exit(0);
}
check().catch(console.error);
