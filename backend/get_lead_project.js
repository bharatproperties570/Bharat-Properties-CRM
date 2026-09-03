import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const lead = await Lead.findById('6a86f784dc69abb10bb5c547').lean();
    console.log(JSON.stringify({ project: lead?.project, location: lead?.location, locArea: lead?.locArea, locCity: lead?.locCity, sector: lead?.sector }, null, 2));
    process.exit(0);
}
run();
