const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function executeMigration() {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    
    const collections = ['contacts', 'deals', 'leads', 'inventories', 'projects'];
    const results = {};
    
    for (const collName of collections) {
        // Query to match records that are either visibleTo Everyone or assignment.visibleTo Everyone
        const docs = await db.collection(collName).find({
            $or: [{ visibleTo: 'Everyone' }, { 'assignment.visibleTo': 'Everyone' }]
        }).toArray();
        
        let safeTeamIds = [];
        
        for (const doc of docs) {
            // Validate deterministic ownership properties exactly as approved
            const teamFound = (doc.teams && doc.teams.length > 0) || doc.team || (doc.assignment && doc.assignment.team && doc.assignment.team.length > 0);
            const hasOwner = doc.owner || doc.assignedTo || (doc.assignment && doc.assignment.assignedTo);
            const isPublished = doc.isPublished === true;
            
            // Waterfall Classification
            if (!teamFound) {
                // excluded: invalid missing team
            } else if (isPublished) {
                // excluded: intentionally public
            } else if (!hasOwner) {
                // excluded: ambiguous
            } else {
                safeTeamIds.push(doc._id);
            }
        }

        let modifiedPrimary = 0;
        let modifiedAssignment = 0;
        
        if (safeTeamIds.length > 0) {
            // Update 1: Change top-level visibleTo if it is 'Everyone'
            const resultPrimary = await db.collection(collName).updateMany(
                { _id: { $in: safeTeamIds }, visibleTo: 'Everyone' },
                { $set: { visibleTo: 'Team' } }
            );
            modifiedPrimary = resultPrimary.modifiedCount;

            // Update 2: Change assignment.visibleTo if it is 'Everyone'
            const resultAssignment = await db.collection(collName).updateMany(
                { _id: { $in: safeTeamIds }, 'assignment.visibleTo': 'Everyone' },
                { $set: { 'assignment.visibleTo': 'Team' } }
            );
            modifiedAssignment = resultAssignment.modifiedCount;
        }
        
        results[collName] = {
            targetCategoryACount: safeTeamIds.length,
            modifiedPrimary,
            modifiedAssignment
        };
    }
    
    console.log("=== MIGRATION EXECUTION COMPLETE ===");
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
}
executeMigration().catch(console.error);
