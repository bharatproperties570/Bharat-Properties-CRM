const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const baseURL = 'http://localhost:4000/api';

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function measure(client, url) {
    const start = Date.now();
    try {
        const res = await client.get(url);
        const time = Date.now() - start;
        return { time, status: res.status, size: JSON.stringify(res.data).length, data: res.data };
    } catch (e) {
        const time = Date.now() - start;
        return { time, status: e.response?.status || 500, size: 0, error: e.message };
    }
}

async function runBenchmark() {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;

    const teams = await db.collection('teams').find({}).limit(2).toArray();
    const userA = await db.collection('users').findOne({ teams: teams[0]._id, isActive: true, dataScope: 'team' });
    const userB = await db.collection('users').findOne({ teams: teams[1]._id, isActive: true, dataScope: 'team' });

    const tokenA = jwt.sign({ id: userA._id }, jwtSecret, { expiresIn: '1d' });
    const tokenB = jwt.sign({ id: userB._id }, jwtSecret, { expiresIn: '1d' });

    const clientA = axios.create({ baseURL, headers: { Authorization: `Bearer ${tokenA}` } });
    const clientB = axios.create({ baseURL, headers: { Authorization: `Bearer ${tokenB}` } });

    console.log("=== STARTING PERFORMANCE BENCHMARK ===");
    console.log(`User A: ${userA.email}, User B: ${userB.email}`);

    const modules = [
        { name: 'Dashboard', path: '/dashboard/kpis' },
        { name: 'Contacts', path: '/contacts?limit=20' },
        { name: 'Leads', path: '/leads?limit=20' },
        { name: 'Deals', path: '/deals?limit=20' },
        { name: 'Inventory', path: '/inventory?limit=20' },
        { name: 'Projects', path: '/projects?limit=20' },
        { name: 'Activities', path: '/activities?limit=20' },
        { name: 'Communication', path: '/conversations/active?limit=20' },
        { name: 'Marketing', path: '/marketing/templates' },
        { name: 'Post Sales (Bookings)', path: '/bookings?limit=20' },
        { name: 'Post Sales (Portfolios)', path: '/portfolios?limit=20' }
    ];

    const results = {};

    for (const mod of modules) {
        console.log(`\nTesting ${mod.name}...`);
        
        // Cold
        const cold = await measure(clientA, mod.path);
        await delay(500);
        
        // Warm 1
        const warm1 = await measure(clientA, mod.path);
        await delay(200);
        
        // Warm 2
        const warm2 = await measure(clientA, mod.path);
        
        // Filter
        let filterPath = mod.path;
        if (filterPath.includes('?')) filterPath += '&search=test';
        else filterPath += '?search=test';
        const filterRes = await measure(clientA, filterPath);
        
        results[mod.name] = {
            cold: cold.time,
            warmAvg: Math.round((warm1.time + warm2.time) / 2),
            filter: filterRes.time,
            status: cold.status,
            sizeKb: Math.round(cold.size / 1024)
        };
        console.log(`  Cold: ${cold.time}ms | Warm: ${results[mod.name].warmAvg}ms | Filter: ${filterRes.time}ms | Size: ${results[mod.name].sizeKb}KB`);
    }

    // Dashboard Cache Specific
    console.log(`\nTesting Dashboard Cache Isolation...`);
    const dashColdA = await measure(clientA, '/dashboard/kpis');
    const dashWarmA = await measure(clientA, '/dashboard/kpis');
    const dashColdB = await measure(clientB, '/dashboard/kpis');
    const dashWarmB = await measure(clientB, '/dashboard/kpis');
    
    // Extracted Cache Expiry (assuming ttl is high, we can't easily wait 5 mins, but we verify hits)
    const dashFilteredA = await measure(clientA, '/dashboard/kpis?dateRange=last_7_days');

    results['DashboardSpecific'] = {
        UserACold: dashColdA.time,
        UserAWarm: dashWarmA.time,
        UserBCold: dashColdB.time,
        UserBWarm: dashWarmB.time,
        UserAFiltered: dashFilteredA.time,
        UserADataCount: dashColdA.data?.data?.leads?.total || 0,
        UserBDataCount: dashColdB.data?.data?.leads?.total || 0
    };

    // Deals Pagination Specific
    console.log(`\nTesting Deals Pagination...`);
    const dealsCold = await measure(clientA, '/deals?limit=20&page=1');
    const dealsWarm = await measure(clientA, '/deals?limit=20&page=1');
    const dealsPage2 = await measure(clientA, '/deals?limit=20&page=2');
    const dealsFilter = await measure(clientA, '/deals?limit=20&search=villa');
    
    results['DealsSpecific'] = {
        Cold: dealsCold.time,
        Warm: dealsWarm.time,
        Page2: dealsPage2.time,
        Filter: dealsFilter.time
    };

    console.log("\n=== FINAL BENCHMARK RESULTS ===");
    console.log(JSON.stringify(results, null, 2));

    process.exit(0);
}
runBenchmark().catch(console.error);
