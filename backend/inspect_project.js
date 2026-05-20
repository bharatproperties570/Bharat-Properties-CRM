import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const projects = await db.collection('projects').find({ name: /Sector 7/i }).toArray();
    console.log("PROJECTS IN 'projects':");
    for (const p of projects) {
        console.log(`ID: ${p._id}, name: "${p.name}", images:`, p.projectImages, `meta:`, p.websiteMetadata);
    }

    const addProjects = await db.collection('add_projects').find({ name: /Sector 7/i }).toArray();
    console.log("PROJECTS IN 'add_projects':");
    for (const p of addProjects) {
        console.log(`ID: ${p._id}, name: "${p.name}", images:`, p.projectImages, `meta:`, p.websiteMetadata);
    }

    process.exit(0);
}
inspect();
