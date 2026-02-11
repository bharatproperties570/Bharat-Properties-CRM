import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("MONGODB_URI is not defined in .env");
    process.exit(1);
}

const isObjectId = (id) => {
    if (!id) return false;
    if (typeof id !== 'string') return false;
    return /^[0-9a-fA-F]{24}$/.test(id);
};

const sanitizeRefFields = (doc, fields) => {
    let changed = false;
    fields.forEach(field => {
        if (doc[field] === "") {
            doc[field] = null;
            changed = true;
        } else if (doc[field] && typeof doc[field] === 'string' && !isObjectId(doc[field])) {
            console.log(`Found invalid ObjectId in field "${field}": "${doc[field]}". Converting to null.`);
            doc[field] = null;
            changed = true;
        }
    });
    return changed;
};

const cleanup = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB.");

        const collections = [
            {
                name: "contacts",
                refFields: ['title', 'countryCode', 'professionCategory', 'professionSubCategory', 'designation', 'source', 'subSource', 'owner']
            },
            {
                name: "deals",
                refFields: ['projectId', 'unitType', 'propertyType', 'location', 'intent', 'status', 'dealType', 'transactionType', 'source']
            }
        ];

        for (const colInfo of collections) {
            console.log(`Cleaning collection: ${colInfo.name}`);
            const collection = mongoose.connection.collection(colInfo.name);
            const cursor = collection.find({});
            let count = 0;
            let updated = 0;

            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                count++;

                let isDirty = sanitizeRefFields(doc, colInfo.refFields);

                // Nested Address Sanitize
                if (doc.personalAddress) {
                    if (doc.personalAddress.country === "" || (doc.personalAddress.country && !isObjectId(doc.personalAddress.country))) {
                        doc.personalAddress.country = null;
                        isDirty = true;
                    }
                }
                if (doc.correspondenceAddress) {
                    if (doc.correspondenceAddress.country === "" || (doc.correspondenceAddress.country && !isObjectId(doc.correspondenceAddress.country))) {
                        doc.correspondenceAddress.country = null;
                        isDirty = true;
                    }
                }

                // Array fields sanitize (Education, Loan, Social, Income, Documents)
                if (Array.isArray(doc.educations)) {
                    doc.educations.forEach(edu => {
                        if (edu.education === "" || (edu.education && !isObjectId(edu.education))) { edu.education = null; isDirty = true; }
                        if (edu.degree === "" || (edu.degree && !isObjectId(edu.degree))) { edu.degree = null; isDirty = true; }
                    });
                }
                if (Array.isArray(doc.loans)) {
                    doc.loans.forEach(loan => {
                        if (loan.loanType === "" || (loan.loanType && !isObjectId(loan.loanType))) { loan.loanType = null; isDirty = true; }
                        if (loan.bank === "" || (loan.bank && !isObjectId(loan.bank))) { loan.bank = null; isDirty = true; }
                    });
                }
                if (Array.isArray(doc.socialMedia)) {
                    doc.socialMedia.forEach(sm => {
                        if (sm.platform === "" || (sm.platform && !isObjectId(sm.platform))) { sm.platform = null; isDirty = true; }
                    });
                }
                if (Array.isArray(doc.incomes)) {
                    doc.incomes.forEach(inc => {
                        if (inc.incomeType === "" || (inc.incomeType && !isObjectId(inc.incomeType))) { inc.incomeType = null; isDirty = true; }
                    });
                }
                if (Array.isArray(doc.documents)) {
                    doc.documents.forEach(d => {
                        if (d.documentName === "" || (d.documentName && !isObjectId(d.documentName))) { d.documentName = null; isDirty = true; }
                        if (d.documentType === "" || (d.documentType && !isObjectId(d.documentType))) { d.documentType = null; isDirty = true; }
                    });
                }

                if (isDirty) {
                    await collection.replaceOne({ _id: doc._id }, doc);
                    updated++;
                }
            }
            console.log(`Finished ${colInfo.name}. Total: ${count}, Updated: ${updated}`);
        }

        console.log("Cleanup complete.");
        process.exit(0);
    } catch (error) {
        console.error("Error during cleanup:", error);
        process.exit(1);
    }
};

cleanup();
