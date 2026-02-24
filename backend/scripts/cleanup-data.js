import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("MONGODB_URI not found in .env");
    process.exit(1);
}

async function cleanup() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB for cleanup...");

        const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
        const Contact = mongoose.model('Contact', new mongoose.Schema({}, { strict: false }));

        const objectIdFields = [
            'requirement', 'subRequirement', 'project', 'budget', 'location',
            'source', 'status', 'propertyType', 'subType', 'unitType',
            'facing', 'roadWidth', 'direction', 'owner', 'contactDetails'
        ];

        console.log("Cleaning up Leads...");
        for (const field of objectIdFields) {
            const result = await Lead.updateMany({ [field]: "" }, { $set: { [field]: null } });
            if (result.modifiedCount > 0) {
                console.log(`- Fixed ${result.modifiedCount} leads for field: ${field}`);
            }
        }

        console.log("Cleaning up Contacts...");
        const contactFields = ['professionCategory', 'professionSubCategory', 'designation', 'company', 'workOffice'];
        for (const field of contactFields) {
            const result = await Contact.updateMany({ [field]: "" }, { $set: { [field]: null } });
            if (result.modifiedCount > 0) {
                console.log(`- Fixed ${result.modifiedCount} contacts for field: ${field}`);
            }
        }

        console.log("Cleanup complete!");
        process.exit(0);
    } catch (error) {
        console.error("Cleanup failed:", error);
        process.exit(1);
    }
}

cleanup();
