const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const baseURL = 'http://localhost:4000/api';
async function run() {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const teams = await db.collection('teams').find({}).limit(2).toArray();
    const userA = await db.collection('users').findOne({ teams: teams[0]._id, isActive: true, dataScope: 'team' });
    const userB = await db.collection('users').findOne({ teams: teams[1]._id, isActive: true, dataScope: 'team' });
    const tokenA = jwt.sign({ id: userA._id }, jwtSecret, { expiresIn: '1d' });
    const tokenB = jwt.sign({ id: userB._id }, jwtSecret, { expiresIn: '1d' });
    const clientA = axios.create({ baseURL, headers: { Authorization: `Bearer ${tokenA}` } });
    const clientB = axios.create({ baseURL, headers: { Authorization: `Bearer ${tokenB}` } });

    console.log("Testing Dashboard Cache Isolation...");
    const t1=Date.now(); await clientA.get('/dashboard/stats').catch(e=>{}); const c1=Date.now()-t1;
    const t2=Date.now(); await clientA.get('/dashboard/stats').catch(e=>{}); const w1=Date.now()-t2;
    const t3=Date.now(); await clientB.get('/dashboard/stats').catch(e=>{}); const c2=Date.now()-t3;
    const t4=Date.now(); await clientB.get('/dashboard/stats').catch(e=>{}); const w2=Date.now()-t4;
    
    console.log(`User A Cold: ${c1}ms, Warm: ${w1}ms`);
    console.log(`User B Cold: ${c2}ms, Warm: ${w2}ms`);
    process.exit(0);
}
run();
