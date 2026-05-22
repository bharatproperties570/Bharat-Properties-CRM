import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const collections = ['deals', 'inventories', 'contacts', 'projects', 'activities'];
    for (const name of collections) {
        const col = db.collection(name);
        const docs = await col.find({}).toArray();
        for (const doc of docs) {
            const str = JSON.stringify(doc);
            if (str.includes("drive.google.com") || str.includes("google.com/open") || str.includes("docs.google.com")) {
                console.log(`MATCH IN ${name} (ID: ${doc._id}):`);
                // Print all fields containing google.com
                const findMatch = (obj, path = '') => {
                    if (typeof obj === 'string') {
                        if (obj.includes("google.com")) {
                            console.log(`  ${path}: "${obj}"`);
                        }
                    } else if (Array.isArray(obj)) {
                        obj.forEach((item, idx) => findMatch(item, `${path}[${idx}]`));
                    } else if (obj && typeof obj === 'object') {
                        Object.keys(obj).forEach(key => findMatch(obj[key], path ? `${path}.${key}` : key));
                    }
                };
                findMatch(doc);
            }
        }
    }
    console.log("Done checking main collections.");
    process.exit(0);
}
inspect();
