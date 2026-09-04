require('dotenv').config();
const mongoose = require('mongoose');

async function runMigration() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    
    console.log("Starting Lead index migration...");
    const db = mongoose.connection.db;

    try {
        const collection = db.collection('leads');
        
        // Check existing indexes
        const indexes = await collection.indexes();
        console.log("Current indexes:", indexes.map(i => i.name));

        const hasMobile1 = indexes.some(i => i.name === 'mobile_1');
        const hasEmail1 = indexes.some(i => i.name === 'email_1');

        if (hasMobile1) {
            console.log("Dropping unique index mobile_1...");
            await collection.dropIndex('mobile_1');
        } else {
            console.log("Index mobile_1 not found. Skipping drop.");
        }

        if (hasEmail1) {
            console.log("Dropping unique index email_1...");
            await collection.dropIndex('email_1');
        } else {
            console.log("Index email_1 not found. Skipping drop.");
        }

        console.log("Recreating mobile and email as non-unique indexes...");
        await collection.createIndex({ mobile: 1 }, { background: true });
        await collection.createIndex({ email: 1 }, { background: true });

        console.log("Lead index migration completed successfully.");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await mongoose.disconnect();
    }
}

// runMigration();
