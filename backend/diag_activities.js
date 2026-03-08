import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bharat-properties-crm";

async function diag() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');

        const Activity = mongoose.model('Activity', new mongoose.Schema({
            participants: Array,
            relatedTo: Array,
            type: String,
            subject: String,
            entityType: String,
            entityId: mongoose.Schema.Types.ObjectId
        }));

        const activities = await Activity.find().limit(10).lean();
        console.log('Recent 10 Activities:');
        activities.forEach((act, i) => {
            console.log(`\n--- Activity ${i + 1} ---`);
            console.log(`Type: ${act.type}`);
            console.log(`Subject: ${act.subject}`);
            console.log(`Participants: ${JSON.stringify(act.participants)}`);
            console.log(`RelatedTo: ${JSON.stringify(act.relatedTo)}`);
            console.log(`Entity: ${act.entityType} (${act.entityId})`);
        });

        const withParts = await Activity.countDocuments({ participants: { $exists: true, $not: { $size: 0 } } });
        const withRelated = await Activity.countDocuments({ relatedTo: { $exists: true, $not: { $size: 0 } } });
        const total = await Activity.countDocuments();

        console.log(`\nTotal Activities: ${total}`);
        console.log(`With Participants: ${withParts}`);
        console.log(`With RelatedTo: ${withRelated}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

diag();
