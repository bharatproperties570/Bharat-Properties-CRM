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
    const teamB = teams[1]?._id;
    
    const { getVisibilityFilter } = await import('./utils/visibility.js');
    const userB = { _id: new mongoose.Types.ObjectId(), dataScope: "team", teams: [teamB] };
    const filterB = await getVisibilityFilter(userB);
    
    console.log("=== VULNERABILITY REPRODUCTION ===");
    
    // VULNERABLE CONTROLLER (Old Behavior)
    // Old controller did: query.$or = [{ _id: { $exists: true } }]
    const vulnerableQuery = { ...filterB };
    vulnerableQuery.$or = [{ _id: { $exists: true } }];
    const countVulnerable = await db.collection('contacts').countDocuments(vulnerableQuery);
    
    // PATCHED CONTROLLER (New Behavior)
    // New controller does: query = { $and: [filterB, { $or: [{ _id: { $exists: true } }] }] }
    const businessQuery = { $or: [{ _id: { $exists: true } }] };
    const patchedQuery = { $and: [filterB, businessQuery] };
    const countPatched = await db.collection('contacts').countDocuments(patchedQuery);
    
    console.log(`Vulnerable Controller (Team B sees): ${countVulnerable} contacts (Leaked all database!)`);
    console.log(`Patched Controller (Team B sees): ${countPatched} contacts (Only allowed ones)`);
    
    process.exit(0);
}
runTests().catch(console.error);
