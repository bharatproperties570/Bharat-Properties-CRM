const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGODB_URI;

async function verify() {
    try {
        await mongoose.connect(mongoURI);
        const AiAgent = mongoose.model('AiAgent', new mongoose.Schema({}, { strict: false }));
        const agent = await AiAgent.findOne({ useCases: 'website_live_chat', isActive: true }).lean();
        console.log("AGENT_DATA:" + JSON.stringify(agent));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
verify();
