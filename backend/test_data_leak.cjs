const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("MONGODB_URI is missing.");
    process.exit(1);
}

const getVisibilityFilter = async (user) => {
    const dataScope = user.dataScope?.toLowerCase() || 'team';
    const effectiveScope = dataScope;
    const userId = user._id;
    const userObjectId = new mongoose.Types.ObjectId(userId.toString());
    const userTeams = (user.teams || []).map(t => new mongoose.Types.ObjectId(t.toString()));

    const baseFilter = {
        $or: [
            { assignedTo: userObjectId },
            { owner: userObjectId },
            { assign: userObjectId },
            { 'assignment.assignedTo': userObjectId }
        ]
    };

    const everyoneFilter = {
        $or: [
            { visibleTo: 'Everyone' },
            { 'assignment.visibleTo': 'Everyone' }
        ]
    };

    let finalFilter;
    if (effectiveScope === 'team') {
        finalFilter = {
            $or: [
                ...baseFilter.$or,
                {
                    $and: [
                        { 
                            $or: [
                                { visibleTo: { $in: ['Team', 'Everyone'] } },
                                { 'assignment.visibleTo': { $in: ['Team', 'Everyone'] } },
                                { visibleTo: { $exists: false } },
                                { visibleTo: null },
                                { 'assignment.visibleTo': { $exists: false } },
                                { 'assignment.visibleTo': null }
                            ]
                        },
                        {
                            $or: [
                                { teams: { $in: userTeams } },
                                { team: { $in: userTeams } },
                                { 'assignment.team': { $in: userTeams } }
                            ]
                        }
                    ]
                },
                everyoneFilter
            ]
        };
    }
    return finalFilter;
};

async function checkData() {
    await mongoose.connect(mongoUri);
    
    const db = mongoose.connection.db;
    const teams = await db.collection('teams').find({}).limit(2).toArray();
    
    const teamA = teams[0]?._id;
    const teamB = teams[1]?._id || teamA;
    
    const dummyUserB = {
        _id: new mongoose.Types.ObjectId(),
        email: "dummy@teamb.com",
        dataScope: "team",
        teams: [teamB]
    };
    
    const filterB = await getVisibilityFilter(dummyUserB);
    
    const counts = {};
    counts.contacts = await db.collection('contacts').countDocuments(filterB);
    counts.deals = await db.collection('deals').countDocuments(filterB);
    counts.leads = await db.collection('leads').countDocuments(filterB);
    counts.inventories = await db.collection('inventories').countDocuments(filterB);
    counts.projects = await db.collection('projects').countDocuments(filterB);
    
    console.log("Documents visible to User B (using strict visibilityFilter):");
    console.log(counts);

    const everyoneCounts = {};
    const everyoneQ = { $or: [{ visibleTo: 'Everyone' }, { 'assignment.visibleTo': 'Everyone' }] };
    everyoneCounts.contacts = await db.collection('contacts').countDocuments(everyoneQ);
    everyoneCounts.deals = await db.collection('deals').countDocuments(everyoneQ);
    everyoneCounts.leads = await db.collection('leads').countDocuments(everyoneQ);
    everyoneCounts.inventories = await db.collection('inventories').countDocuments(everyoneQ);
    everyoneCounts.projects = await db.collection('projects').countDocuments(everyoneQ);
    
    console.log("Documents with visibleTo='Everyone':");
    console.log(everyoneCounts);
    
    process.exit(0);
}
checkData().catch(console.error);
