/**
 * Migration: Add Dormant Stage to Lookups
 * 
 * Ensures the 'Dormant' value exists in the 'lookups' collection for
 * 'Stage' and 'Status' types in the production database.
 */

import { MongoClient } from 'mongodb';

const uri = (() => { throw new Error('CRITICAL: Hardcoded production credential removed. Use MONGODB_URI env var.') })();
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const db = client.db('bharatproperties1');
        const lookups = db.collection('lookups');

        const types = ['Stage', 'Status'];
        
        for (const type of types) {
            console.log(`Checking '${type}' lookup for 'Dormant'...`);
            const existing = await lookups.findOne({ 
                lookup_type: type, 
                lookup_value: 'Dormant' 
            });

            if (!existing) {
                console.log(`Adding 'Dormant' to '${type}'...`);
                await lookups.insertOne({
                    lookup_type: type,
                    lookup_value: 'Dormant',
                    isActive: true,
                    order: 99,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    __v: 0
                });
                console.log(`Successfully added 'Dormant' to '${type}'.`);
            } else {
                console.log(`'Dormant' already exists in '${type}'.`);
            }
        }

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.close();
    }
}

run();
