const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({ isActive: true });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    
    // 1. Get 1 specific deal for structural comparison
    const url = 'http://localhost:4000/api/deals?limit=5&page=1';
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    
    fs.writeFileSync('deal_post_opt.json', JSON.stringify(res.data, null, 2));
    console.log("Saved deal_post_opt.json.");
    process.exit(0);
}
run().catch(console.error);
