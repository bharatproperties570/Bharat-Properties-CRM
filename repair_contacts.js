
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Try to find .env in current or backend dir
dotenv.config(); // looks in current dir
if (!process.env.MONGODB_URI) {
    dotenv.config({ path: './backend/.env' });
}
if (!process.env.MONGODB_URI) {
    dotenv.config({ path: '../backend/.env' });
}
if (!process.env.MONGODB_URI) {
    dotenv.config({ path: './.env' });
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("MONGODB_URI not found");
    process.exit(1);
}

// Minimal Schema
const ContactSchema = new mongoose.Schema({}, { strict: false, collection: 'contacts' });
const Contact = mongoose.model('Contact', ContactSchema);

async function repairData() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to DB");

        const contacts = await Contact.find({}).lean();
        console.log(`Analyzing ${contacts.length} contacts for repair...`);

        const refFields = [
            'title', 'countryCode', 'professionCategory', 'professionSubCategory',
            'designation', 'source', 'subSource', 'owner'
        ];

        const addressRefFields = ['state', 'city', 'tehsil', 'postOffice', 'location', 'country'];

        let repairCount = 0;

        for (const c of contacts) {
            let needsRepair = false;
            let updateObj = {};

            refFields.forEach(f => {
                if (c[f] === "" || c[f] === "undefined" || c[f] === "null") {
                    needsRepair = true;
                    updateObj[f] = null;
                } else if (c[f] && typeof c[f] === 'string' && !mongoose.Types.ObjectId.isValid(c[f])) {
                    // It's a string, not empty, but not an ObjectId. 
                    // This is dangerous for populate. 
                    // In this system, these fields SHOULD be ObjectIds (refs to Lookup/User).
                    // If they are junk strings, we set to null.
                    console.log(`[Contact ${c._id}] Invalid ID for ${f}: "${c[f]}". Clearing.`);
                    needsRepair = true;
                    updateObj[f] = null;
                }
            });

            // Handle Address
            ['personalAddress', 'correspondenceAddress'].forEach(addrField => {
                if (c[addrField]) {
                    addressRefFields.forEach(f => {
                        const val = c[addrField][f];
                        if (val === "" || val === "undefined" || val === "null") {
                            needsRepair = true;
                            updateObj[`${addrField}.${f}`] = null;
                        } else if (val && typeof val === 'string' && !mongoose.Types.ObjectId.isValid(val)) {
                            console.log(`[Contact ${c._id}] Invalid ID for ${addrField}.${f}: "${val}". Clearing.`);
                            needsRepair = true;
                            updateObj[`${addrField}.${f}`] = null;
                        }
                    });
                }
            });

            // Handle Arrays
            ['educations', 'loans', 'socialMedia', 'incomes', 'documents'].forEach(arrField => {
                if (Array.isArray(c[arrField])) {
                    let arrChanged = false;
                    const newArr = c[arrField].map(item => {
                        let itemChanged = false;
                        const newItem = { ...item };

                        // Check common ref fields in these arrays
                        const fieldsToCheck = [
                            'education', 'degree', 'loanType', 'bank',
                            'platform', 'incomeType', 'documentName', 'documentType'
                        ];

                        fieldsToCheck.forEach(f => {
                            if (newItem[f] === "" || newItem[f] === "undefined" || (newItem[f] && typeof newItem[f] === 'string' && !mongoose.Types.ObjectId.isValid(newItem[f]))) {
                                newItem[f] = null;
                                itemChanged = true;
                            }
                        });

                        if (itemChanged) arrChanged = true;
                        return newItem;
                    });

                    if (arrChanged) {
                        needsRepair = true;
                        updateObj[arrField] = newArr;
                    }
                }
            });

            if (needsRepair) {
                await Contact.updateOne({ _id: c._id }, { $set: updateObj });
                repairCount++;
                console.log(`Repaired contact ${c._id} (${c.name})`);
            }
        }

        console.log(`Success: Repaired ${repairCount} contacts.`);
        process.exit(0);
    } catch (err) {
        console.error("Repair failed:", err);
        process.exit(1);
    }
}

repairData();
