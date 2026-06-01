require('dotenv').config();
const mongoose = require('mongoose');

async function checkProject() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const projects = await db.collection('projects').find({ 
            name: { $regex: /Aerocity mohali/i } 
        }).toArray();
        console.log("Found projects:", projects.map(p => p.name));
        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}
checkProject();
