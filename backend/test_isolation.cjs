const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function runTests() {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    
    const teams = await db.collection('teams').find({}).limit(2).toArray();
    const teamA = teams[0]?._id;
    const teamB = teams[1]?._id || teamA;
    
    // We will test using getVisibilityFilter and mimicking the exact controller merge logic
    // We already know the controller merge logic is:
    // query = { $and: [visibilityFilter, businessQuery] }
    
    const { getVisibilityFilter } = await import('./utils/visibility.js');
    
    const userA = { _id: new mongoose.Types.ObjectId(), dataScope: "team", teams: [teamA] };
    const userB = { _id: new mongoose.Types.ObjectId(), dataScope: "team", teams: [teamB] };
    const adminUser = { _id: new mongoose.Types.ObjectId(), dataScope: "all", teams: [] };
    
    const filterA = await getVisibilityFilter(userA);
    const filterB = await getVisibilityFilter(userB);
    const filterAdmin = await getVisibilityFilter(adminUser);
    
    console.log("=== CROSS-TEAM ISOLATION TESTS ===\n");
    
    const runTest = async (module, collection, searchCondition) => {
        // Mock Controller Logic
        const businessQuery = searchCondition ? { $or: searchCondition } : {};
        
        // Final backend query after patch
        const finalQueryA = Object.keys(filterA).length > 0 ? { $and: [filterA, businessQuery] } : businessQuery;
        const finalQueryB = Object.keys(filterB).length > 0 ? { $and: [filterB, businessQuery] } : businessQuery;
        const finalQueryAdmin = Object.keys(filterAdmin).length > 0 ? { $and: [filterAdmin, businessQuery] } : businessQuery;
        
        const countA = await db.collection(collection).countDocuments(finalQueryA);
        const countB = await db.collection(collection).countDocuments(finalQueryB);
        const countAdmin = await db.collection(collection).countDocuments(finalQueryAdmin);
        
        return { countA, countB, countAdmin };
    };
    
    // Mock conditions mimicking UI hacks
    const mockSearch = [{ name: /test/i }, { description: /test/i }];
    
    console.log("1. Contacts (List without search)");
    let res = await runTest("Contacts", "contacts", null);
    console.log(res);
    
    console.log("2. Contacts (With maliciously wide $or search)");
    res = await runTest("Contacts", "contacts", mockSearch);
    console.log(res);

    console.log("3. Deals (With maliciously wide $or search)");
    res = await runTest("Deals", "deals", mockSearch);
    console.log(res);
    
    console.log("4. Inventory (With maliciously wide $or search)");
    res = await runTest("Inventory", "inventories", mockSearch);
    console.log(res);
    
    process.exit(0);
}
runTests().catch(console.error);
