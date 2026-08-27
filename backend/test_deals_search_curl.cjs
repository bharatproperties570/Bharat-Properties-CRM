const jwt = require('jsonwebtoken');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const axios = require('axios');

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({ isActive: true });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    
    console.time("API Request");
    const res = await axios.get('http://localhost:4000/api/deals?limit=20&search=test', {
        headers: { Authorization: `Bearer ${token}` }
    });
    console.timeEnd("API Request");
    console.log("Status:", res.status);
    console.log("Size:", JSON.stringify(res.data).length);
    process.exit(0);
}
run().catch(console.error);
