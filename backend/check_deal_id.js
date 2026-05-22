import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

async function search() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        console.log('Connected to DB');

        const collectionsToSearch = ['deals', 'inventories', 'leads', 'lookups'];
        for (const name of collectionsToSearch) {
            const collection = mongoose.connection.db.collection(name);
            console.log(`Searching collection: ${name}`);
            const docs = await collection.find({}).toArray();
            for (const doc of docs) {
                const docString = JSON.stringify(doc);
                if (docString.includes('69cfec103dc8a3ece367942d')) {
                    console.log(`Found ID in collection "${name}", doc ID: ${doc._id}`);
                    for (const [key, value] of Object.entries(doc)) {
                        if (JSON.stringify(value).includes('69cfec103dc8a3ece367942d')) {
                            console.log(`  -> Field "${key}":`, value);
                        }
                    }
                }
            }
        }
        console.log('Search finished');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

search();
