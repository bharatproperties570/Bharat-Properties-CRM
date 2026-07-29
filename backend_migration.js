import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function runMigration() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const collections = ['leads', 'deals', 'contacts', 'activities'];

        const stageMapping = {
            'New': 'Incoming',
            'Qualified': 'Prospect',
            'Booked': 'Negotiation',
            'Dormant': 'Closed (Lost)',
            'Closed Lost': 'Closed (Lost)',
            'Closed': 'Closed (Won)'
        };

        for (const colName of collections) {
            console.log(`Processing collection: ${colName}`);
            const collection = db.collection(colName);
            for (const [oldStage, newStage] of Object.entries(stageMapping)) {
                const result = await collection.updateMany(
                    { stage: oldStage },
                    { $set: { stage: newStage } }
                );
                console.log(`  Updated ${result.modifiedCount} records from '${oldStage}' to '${newStage}'`);
            }
        }
        
        // Lookup Collection
        console.log(`Processing collection: lookups`);
        const lookups = db.collection('lookups');
        for (const [oldStage, newStage] of Object.entries(stageMapping)) {
            const result = await lookups.updateMany(
                { lookup_type: 'Stage', lookup_value: oldStage },
                { $set: { lookup_value: newStage } }
            );
            console.log(`  Updated ${result.modifiedCount} lookups from '${oldStage}' to '${newStage}'`);
        }

        console.log('Migration Complete.');
    } catch (e) {
        console.error('Migration failed', e);
    } finally {
        await mongoose.disconnect();
    }
}

runMigration();
