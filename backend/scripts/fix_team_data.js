import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from .env in backend root (assuming run from backend/)
dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("ERROR: MONGODB_URI not found in backend/.env");
    process.exit(1);
}

// Minimal Schema to avoid validation overhead but allow updates
const LeadSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    name: String,
    assignment: {
        team: [{ type: mongoose.Schema.Types.Mixed }]
    }
}, { strict: false, timestamps: false });

const TeamSchema = new mongoose.Schema({
    name: String
}, { strict: false });

const Lead = mongoose.model("Lead", LeadSchema);
const Team = mongoose.model("Team", TeamSchema);

const TEAM_NAME_TO_ID = {
    "kurukshetra team": "6991ad69e07eb3dd7dd46681",
    "mohali team": "6994a8e9f7766c82fa54e89c"
};

async function migrate() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGODB_URI);
        console.log("✅ Connected successfully.");

        // First, verify the teams exist (Optional but good for safety)
        for (const [name, id] of Object.entries(TEAM_NAME_TO_ID)) {
            const team = await Team.findById(id);
            if (!team) {
                console.warn(`[WARN] Team "${name}" with ID ${id} not found in database.`);
            } else {
                console.log(`[INFO] Verified Team: ${team.name} (${id})`);
            }
        }

        const leads = await Lead.find({ "assignment.team": { $exists: true } });
        console.log(`Searching through ${leads.length} leads with assignments...`);
        
        let updateCount = 0;

        for (const lead of leads) {
            let changed = false;
            if (lead.assignment && Array.isArray(lead.assignment.team)) {
                const newTeams = lead.assignment.team.map(t => {
                    // Check if the team value is a string and matches our mock patterns
                    if (typeof t === 'string') {
                        const lower = t.toLowerCase();
                        if (TEAM_NAME_TO_ID[lower]) {
                            changed = true;
                            console.log(`   -> Transforming "${t}" to ${TEAM_NAME_TO_ID[lower]} for lead ${lead._id}`);
                            return new mongoose.Types.ObjectId(TEAM_NAME_TO_ID[lower]);
                        }
                    }
                    return t;
                });

                if (changed) {
                    // Using set to avoid sub-document issues
                    lead.set('assignment.team', newTeams);
                    await lead.save();
                    updateCount++;
                }
            }
        }

        console.log(`\n✨ Migration complete.`);
        console.log(`Total Leads Updated: ${updateCount}`);
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
}

migrate();
