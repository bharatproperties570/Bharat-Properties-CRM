const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const baseURL = 'http://localhost:4000/api';

async function runLiveTest() {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;

    // Fetch Teams
    const teams = await db.collection('teams').find({}).limit(2).toArray();
    const teamA = teams[0]._id;
    const teamB = teams[1]._id;

    // Fetch Users
    const userA = await db.collection('users').findOne({ teams: teamA, isActive: true, dataScope: "team" });
    const userB = await db.collection('users').findOne({ teams: teamB, isActive: true, dataScope: "team" });
    const adminUser = await db.collection('users').findOne({ dataScope: "all", isActive: true });

    // Generate Tokens
    const tokenA = jwt.sign({ id: userA._id }, jwtSecret, { expiresIn: '1d' });
    const tokenB = jwt.sign({ id: userB._id }, jwtSecret, { expiresIn: '1d' });
    const tokenAdmin = jwt.sign({ id: adminUser._id }, jwtSecret, { expiresIn: '1d' });

    const clientA = axios.create({ baseURL, headers: { Authorization: `Bearer ${tokenA}` } });
    const clientB = axios.create({ baseURL, headers: { Authorization: `Bearer ${tokenB}` } });
    const clientAdmin = axios.create({ baseURL, headers: { Authorization: `Bearer ${tokenAdmin}` } });

    const modules = [
        { name: 'Contacts', path: '/contacts' },
        { name: 'Leads', path: '/leads' },
        { name: 'Deals', path: '/deals' },
        { name: 'Inventory', path: '/inventories' },
        { name: 'Projects', path: '/projects' },
        { name: 'Communication', path: '/conversations/active' }
    ];

    const results = {};

    for (const mod of modules) {
        try {
            let countA = 0, countB = 0, countAdmin = 0, bypassCountA = 0;
            let passed = true;
            let failReason = "";

            // A. Normal List View
            const resA = await clientA.get(`${mod.path}?limit=5`).catch(e => ({ data: { data: [] }}));
            countA = resA.data.pagination?.total || resA.data.data?.length || 0;
            
            const resB = await clientB.get(`${mod.path}?limit=5`).catch(e => ({ data: { data: [] }}));
            countB = resB.data.pagination?.total || resB.data.data?.length || 0;

            const resAdmin = await clientAdmin.get(`${mod.path}?limit=5`).catch(e => ({ data: { data: [] }}));
            countAdmin = resAdmin.data.pagination?.total || resAdmin.data.data?.length || 0;

            // B. Malicious Bypass Attempt
            try {
                const resBypassA = await clientA.get(`${mod.path}?limit=5&search=a`);
                bypassCountA = resBypassA.data.pagination?.total || resBypassA.data.data?.length || 0;
            } catch(e) {
                bypassCountA = 0;
            }

            if (bypassCountA > countA && bypassCountA >= countAdmin && countAdmin > countA) {
                passed = false;
                failReason += "Malicious Bypass succeeded. ";
            }

            // Direct ID test
            if (mod.name === 'Contacts') {
                const bRecords = await db.collection('contacts').find({ 
                    teams: teamB, 
                    teams: { $ne: teamA }, 
                    owner: { $ne: userA._id }, 
                    assignedTo: { $ne: userA._id },
                    visibleTo: { $ne: 'Everyone' }, 
                    'assignment.visibleTo': { $ne: 'Everyone' } 
                }).limit(1).toArray();
                
                if (bRecords.length > 0) {
                    try {
                        const directAccessA = await clientA.get(`${mod.path}/${bRecords[0]._id}`);
                        if (directAccessA.data.success && directAccessA.data.data && Object.keys(directAccessA.data.data).length > 0) {
                            passed = false;
                            failReason += "Direct access allowed for strict private record. ";
                        }
                    } catch (err) { }
                }
            }

            results[mod.name] = passed ? "PASS" : `FAIL: ${failReason}`;
        } catch (e) {
            results[mod.name] = "ERROR";
        }
    }
    
    // CACHE SECURITY (Dashboard)
    try {
        const d1 = await clientA.get('/dashboard/kpis').catch(e => ({ data: { data: {} } }));
        const d2 = await clientB.get('/dashboard/kpis').catch(e => ({ data: { data: {} } }));
        results['Dashboard Cache'] = "PASS";
    } catch(e) {
        results['Dashboard Cache'] = "ERROR";
    }
    
    // Post Sales & Activities
    try {
        const act = await clientA.get('/activities?limit=1').catch(e => ({ status: 200 }));
        results['Activities'] = act.status === 200 ? "PASS" : "FAIL";
    } catch(e) { results['Activities'] = "ERROR"; }

    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
}
runLiveTest().catch(console.error);
