import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI);

const lookupSchema = new mongoose.Schema({}, { strict: false, collection: 'lookups', timestamps: true });
const Lookup = mongoose.model('Lookup', lookupSchema);

const parsingRuleSchema = new mongoose.Schema({}, { strict: false, collection: 'parsing_rules', timestamps: true });
const ParsingRule = mongoose.model('ParsingRule', parsingRuleSchema);

async function check() {
    console.log("Recent Lookups Updated in last 1 hour:");
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentLookups = await Lookup.find({ updatedAt: { $gte: oneHourAgo } }).sort({ updatedAt: -1 }).limit(10).lean();
    console.log(JSON.stringify(recentLookups, null, 2));

    console.log("Recent Parsing Rules Updated:");
    const recentRules = await ParsingRule.find({ updatedAt: { $gte: oneHourAgo } }).sort({ updatedAt: -1 }).limit(5).lean();
    console.log(JSON.stringify(recentRules, null, 2));

    mongoose.disconnect();
}

check();
