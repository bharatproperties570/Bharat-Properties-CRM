const mongoose = require('mongoose');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function runAudit() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    let report = {};
    
    for (const col of collections) {
        const name = col.name;
        const collection = db.collection(name);
        
        try {
            const stats = await db.command({ collStats: name });
            const count = stats.count;
            const avgObjSize = stats.avgObjSize || 0;
            const size = stats.size || 0;
            
            const indexes = await collection.indexes();
            
            // Sample 1 doc for schema inference
            const sample = await collection.findOne();
            
            report[name] = {
                count,
                avgObjSize,
                size,
                indexes: indexes.map(i => i.name),
                keys: sample ? Object.keys(sample) : []
            };
        } catch(e) {
            console.error(`Error on ${name}:`, e.message);
        }
    }
    
    fs.writeFileSync('db_audit_report.json', JSON.stringify(report, null, 2));
    console.log('Audit complete.');
    process.exit(0);
}

runAudit().catch(console.error);
