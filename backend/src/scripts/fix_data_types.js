import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Models
import User from "../../models/User.js";
import Team from "../../models/Team.js";
import Lead from "../../models/Lead.js";
import Contact from "../../models/Contact.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function fixDataTypes() {
    try {
        console.log("🚀 Starting Data Type Cleanup Script...");
        const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/bharatproperties1";
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        // 1. Resolve Teams and Users into Maps for fast lookup
        const allTeams = await Team.find({}).lean();
        const teamMap = new Map();
        allTeams.forEach(t => {
            teamMap.set(t.name.toLowerCase(), t._id);
            teamMap.set(t._id.toString(), t._id);
        });

        const allUsers = await User.find({}).lean();
        const userMap = new Map();
        allUsers.forEach(u => {
            userMap.set(u.fullName.toLowerCase(), u._id);
            if (u.username) userMap.set(u.username.toLowerCase(), u._id);
            userMap.set(u.email.toLowerCase(), u._id);
            userMap.set(u._id.toString(), u._id);
        });

        console.log(`📊 Loaded ${teamMap.size} teams and ${userMap.size} users for resolution.`);

        // 1.5 Fix Users (The most likely source of the visibility crash)
        console.log("🔍 Scanning Users for invalid ID types in teams...");
        const usersCollection = mongoose.connection.collection("users");
        const usersInDB = await usersCollection.find({}).toArray();
        let userUpdates = 0;
        
        for (const user of usersInDB) {
            let changed = false;
            const update = {};

            if (Array.isArray(user.teams)) {
                const resolved = [];
                let teamsChanged = false;
                for (const t of user.teams) {
                    if (mongoose.Types.ObjectId.isValid(t)) {
                        resolved.push(new mongoose.Types.ObjectId(t.toString()));
                    } else if (typeof t === 'string' && teamMap.has(t.toLowerCase())) {
                        resolved.push(teamMap.get(t.toLowerCase()));
                        teamsChanged = true;
                    }
                }
                if (teamsChanged) {
                    update.teams = resolved;
                    changed = true;
                }
            }

            if (user.team && !mongoose.Types.ObjectId.isValid(user.team)) {
                if (typeof user.team === 'string' && teamMap.has(user.team.toLowerCase())) {
                    update.team = teamMap.get(user.team.toLowerCase());
                    changed = true;
                } else {
                    update.team = null;
                    changed = true;
                }
            }

            if (changed) {
                await usersCollection.updateOne({ _id: user._id }, { $set: update });
                userUpdates++;
            }
        }
        console.log(`✅ Updated ${userUpdates} Users.`);

        // 2. Fix Leads
        console.log("🔍 Scanning Leads for invalid ID types...");
        const leadsCollection = mongoose.connection.collection("leads");
        const leadsInDB = await leadsCollection.find({}).toArray();
        let leadUpdates = 0;

        for (const lead of leadsInDB) {
            let changed = false;
            const update = {};

            if (lead.assignment?.team) {
                const raw = Array.isArray(lead.assignment.team) ? lead.assignment.team : [lead.assignment.team];
                const resolved = [];
                let teamChanged = false;
                for (const t of raw) {
                    if (mongoose.Types.ObjectId.isValid(t)) {
                        resolved.push(new mongoose.Types.ObjectId(t.toString()));
                    } else if (typeof t === 'string' && teamMap.has(t.toLowerCase())) {
                        resolved.push(teamMap.get(t.toLowerCase()));
                        teamChanged = true;
                    }
                }
                if (teamChanged) {
                    update["assignment.team"] = resolved;
                    changed = true;
                }
            }

            if (Array.isArray(lead.teams)) {
                const resolved = [];
                let teamsChanged = false;
                for (const t of lead.teams) {
                    if (mongoose.Types.ObjectId.isValid(t)) {
                        resolved.push(new mongoose.Types.ObjectId(t.toString()));
                    } else if (typeof t === 'string' && teamMap.has(t.toLowerCase())) {
                        resolved.push(teamMap.get(t.toLowerCase()));
                        teamsChanged = true;
                    }
                }
                if (teamsChanged) {
                    update.teams = resolved;
                    changed = true;
                }
            }

            if (lead.owner && !mongoose.Types.ObjectId.isValid(lead.owner)) {
                if (typeof lead.owner === 'string' && userMap.has(lead.owner.toLowerCase())) {
                    update.owner = userMap.get(lead.owner.toLowerCase());
                    changed = true;
                } else {
                    // update.owner = null; 
                    // changed = true;
                }
            }

            if (changed) {
                await leadsCollection.updateOne({ _id: lead._id }, { $set: update });
                leadUpdates++;
            }
        }
        console.log(`✅ Updated ${leadUpdates} Leads.`);

        // 3. Fix Contacts
        console.log("🔍 Scanning Contacts for invalid ID types...");
        const contactsCollection = mongoose.connection.collection("contacts");
        const contactsInDB = await contactsCollection.find({}).toArray();
        let contactUpdates = 0;

        for (const contact of contactsInDB) {
            let changed = false;
            const update = {};

            if (contact.team && !mongoose.Types.ObjectId.isValid(contact.team)) {
                if (typeof contact.team === 'string' && teamMap.has(contact.team.toLowerCase())) {
                    update.team = teamMap.get(contact.team.toLowerCase());
                    changed = true;
                } else {
                    update.team = null;
                    changed = true;
                }
            }

            if (Array.isArray(contact.teams)) {
                const resolved = [];
                let teamsChanged = false;
                for (const t of contact.teams) {
                    if (mongoose.Types.ObjectId.isValid(t)) {
                        resolved.push(new mongoose.Types.ObjectId(t.toString()));
                    } else if (typeof t === 'string' && teamMap.has(t.toLowerCase())) {
                        resolved.push(teamMap.get(t.toLowerCase()));
                        teamsChanged = true;
                    }
                }
                if (teamsChanged) {
                    update.teams = resolved;
                    changed = true;
                }
            }

            if (changed) {
                await contactsCollection.updateOne({ _id: contact._id }, { $set: update });
                contactUpdates++;
            }
        }
        console.log(`✅ Updated ${contactUpdates} Contacts.`);

        console.log("✨ Cleanup Complete!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup Failed:", err);
        process.exit(1);
    }
}

fixDataTypes();
