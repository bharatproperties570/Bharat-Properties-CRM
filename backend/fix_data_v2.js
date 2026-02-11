import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bharat-properties";

async function fixData() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const Contact = mongoose.model('Contact', new mongoose.Schema({}, { strict: false }));

        const contacts = await Contact.find({});
        console.log(`Found ${contacts.length} contacts`);

        let totalFixed = 0;

        for (const contact of contacts) {
            let needsFix = false;

            // 1. Root level fields
            const rootFields = ['title', 'countryCode', 'professionCategory', 'professionSubCategory', 'designation', 'source', 'subSource'];
            for (const field of rootFields) {
                if (contact[field] === "") {
                    contact[field] = null;
                    needsFix = true;
                }
            }

            // 2. Nested addresses
            const addresses = ['personalAddress', 'correspondenceAddress'];
            for (const addr of addresses) {
                if (contact[addr] && contact[addr].country === "") {
                    contact[addr].country = null;
                    contact.markModified(addr);
                    needsFix = true;
                }
            }

            // 3. Arrays
            const arrayConfigs = [
                { key: 'educations', fields: ['education', 'degree'] },
                { key: 'loans', fields: ['loanType', 'bank'] },
                { key: 'socialMedia', fields: ['platform'] },
                { key: 'incomes', fields: ['incomeType'] },
                { key: 'documents', fields: ['documentName', 'documentType'] }
            ];

            for (const config of arrayConfigs) {
                if (contact[config.key] && Array.isArray(contact[config.key])) {
                    let arrayChanged = false;
                    const arr = contact[config.key];
                    for (let i = 0; i < arr.length; i++) {
                        for (const field of config.fields) {
                            if (arr[i][field] === "") {
                                arr[i][field] = null;
                                arrayChanged = true;
                                needsFix = true;
                            }
                        }
                    }
                    if (arrayChanged) {
                        contact.markModified(config.key);
                    }
                }
            }

            if (needsFix) {
                await contact.save();
                totalFixed++;
                console.log(`Fixed contact: ${contact._id}`);
            }
        }

        console.log(`Cleanup complete. Total contacts fixed: ${totalFixed}`);
        process.exit(0);
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
}

fixData();
