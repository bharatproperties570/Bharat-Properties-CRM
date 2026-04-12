import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bharat-properties-crm";

// Models (Minimal Schemas for migration)
const TeamSchema = new mongoose.Schema({ name: String }, { strict: false });
const UserSchema = new mongoose.Schema({ fullName: String, teams: Array, team: mongoose.Schema.Types.ObjectId, dataScope: String }, { strict: false });
const LeadSchema = new mongoose.Schema({}, { strict: false });
const DealSchema = new mongoose.Schema({}, { strict: false });
const InventorySchema = new mongoose.Schema({}, { strict: false });
const ContactSchema = new mongoose.Schema({}, { strict: false });
const ProjectSchema = new mongoose.Schema({}, { strict: false });
const ActivitySchema = new mongoose.Schema({}, { strict: false });

const Team = mongoose.model('Migrate_Team', TeamSchema, 'teams');
const User = mongoose.model('Migrate_User', UserSchema, 'users');
const Lead = mongoose.model('Migrate_Lead', LeadSchema, 'leads');
const Deal = mongoose.model('Migrate_Deal', DealSchema, 'deals');
const Inventory = mongoose.model('Migrate_Inventory', InventorySchema, 'inventories');
const Contact = mongoose.model('Migrate_Contact', ContactSchema, 'contacts');
const Project = mongoose.model('Migrate_Project', ProjectSchema, 'projects');
const Activity = mongoose.model('Migrate_Activity', ActivitySchema, 'activities');

async function migrate() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGODB_URI);
        console.log("Connected successfully.");

        // 1. Find Targets
        const targetTeam = await Team.findOne({ name: /Kurukshetra/i });
        const targetUser = await User.findOne({ fullName: /Suraj Keshwar/i });

        if (!targetTeam || !targetUser) {
            console.error("Critical Failure: Team or User not found!");
            console.log("Team Found:", targetTeam ? targetTeam.name : "NO");
            console.log("User Found:", targetUser ? targetUser.fullName : "NO");
            process.exit(1);
        }

        const TEAM_ID = targetTeam._id;
        const USER_ID = targetUser._id;

        console.log(`Starting migration for Team: ${targetTeam.name} (${TEAM_ID}) and User: ${targetUser.fullName} (${USER_ID})`);

        // 2. Align User
        const userUpdate = await User.findByIdAndUpdate(USER_ID, {
            $set: {
                teams: [TEAM_ID],
                team: TEAM_ID,
                dataScope: "team"
            }
        });
        console.log(`- User Suraj Keshwar updated: ${userUpdate ? "SUCCESS" : "FAILED"}`);

        // 3. Migrate Collections
        const updatePayload = {
            $set: {
                teams: [TEAM_ID],
                team: TEAM_ID,
                assignedTo: USER_ID,
                owner: USER_ID // for Contacts
            }
        };

        const results = await Promise.all([
            Lead.updateMany({}, updatePayload),
            Deal.updateMany({}, updatePayload),
            Inventory.updateMany({}, updatePayload),
            Contact.updateMany({}, updatePayload),
            Project.updateMany({}, { $set: { teams: [TEAM_ID], team: TEAM_ID } }), // Projects don't usually have assignedTo in same way
            Activity.updateMany({}, { $set: { teams: [TEAM_ID] } })
        ]);

        console.log("Migration Results:");
        console.log(`- Leads updated: ${results[0].modifiedCount}`);
        console.log(`- Deals updated: ${results[1].modifiedCount}`);
        console.log(`- Inventory updated: ${results[2].modifiedCount}`);
        console.log(`- Contacts updated: ${results[3].modifiedCount}`);
        console.log(`- Projects updated: ${results[4].modifiedCount}`);
        console.log(`- Activities updated: ${results[5].modifiedCount}`);

        console.log("Migration finished successfully!");
        process.exit(0);

    } catch (error) {
        console.error("Migration Error:", error);
        process.exit(1);
    }
}

migrate();
