const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function dryRun() {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    
    const collections = ['contacts', 'deals', 'leads', 'inventories', 'projects'];
    const results = {};
    
    for (const collName of collections) {
        // Query to match records that are either visibleTo Everyone or assignment.visibleTo Everyone
        const docs = await db.collection(collName).find({
            $or: [{ visibleTo: 'Everyone' }, { 'assignment.visibleTo': 'Everyone' }]
        }).toArray();
        
        let safeTeam = [];
        let intentionallyPublic = 0;
        let ambiguous = 0;
        let invalidMissingTeam = 0;
        
        for (const doc of docs) {
            // Validate deterministic ownership properties
            const teamFound = (doc.teams && doc.teams.length > 0) || doc.team || (doc.assignment && doc.assignment.team && doc.assignment.team.length > 0);
            const hasOwner = doc.owner || doc.assignedTo || (doc.assignment && doc.assignment.assignedTo);
            const isPublished = doc.isPublished === true;
            
            // Waterfall Classification
            if (!teamFound) {
                invalidMissingTeam++;
            } else if (isPublished) {
                intentionallyPublic++;
            } else if (!hasOwner) {
                ambiguous++;
            } else {
                safeTeam.push(doc._id);
            }
        }
        
        results[collName] = {
            matched: docs.length,
            wouldChange: safeTeam.length,
            excluded: intentionallyPublic + ambiguous + invalidMissingTeam,
            excludedReason: {
                published: intentionallyPublic,
                ambiguous: ambiguous,
                missingTeam: invalidMissingTeam
            },
            sampleIds: safeTeam.slice(0, 3)
        };
    }
    
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
}
dryRun().catch(console.error);
