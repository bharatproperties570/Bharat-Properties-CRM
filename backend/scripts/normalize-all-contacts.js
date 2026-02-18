import mongoose from "mongoose";
import dotenv from "dotenv";
import Lookup from "../models/Lookup.js";
import User from "../models/User.js";

dotenv.config();

const resolveLookup = async (type, value) => {
    if (!value) return null;
    if (typeof value === 'object' && value._id) value = value._id;
    if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);

    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: value });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
        console.log(`[NEW LOOKUP] Created ${type}: ${value}`);
    }
    return lookup._id;
};

const resolveUser = async (identifier) => {
    if (!identifier) return null;
    if (mongoose.Types.ObjectId.isValid(identifier)) return new mongoose.Types.ObjectId(identifier);

    const user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${identifier}$`, 'i') } },
            { email: identifier.toLowerCase() }
        ]
    });
    return user ? user._id : null;
};

const normalizeAllContacts = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const collection = db.collection('contacts');

        const contacts = await collection.find({}).toArray();
        console.log(`Analyzing ${contacts.length} raw contacts...`);

        for (const contact of contacts) {
            let updates = {};
            let isChanged = false;

            const processField = async (path, type, currentVal) => {
                if (currentVal && !mongoose.Types.ObjectId.isValid(currentVal)) {
                    const resolved = await resolveLookup(type, currentVal);
                    if (resolved) {
                        updates[path] = resolved;
                        return true;
                    }
                }
                return false;
            };

            // Standard Lookups
            if (await processField('title', 'Title', contact.title)) isChanged = true;
            if (await processField('countryCode', 'Country-Code', contact.countryCode)) isChanged = true;
            if (await processField('professionCategory', 'ProfessionalCategory', contact.professionCategory)) isChanged = true;
            if (await processField('professionSubCategory', 'ProfessionalSubCategory', contact.professionSubCategory)) isChanged = true;
            if (await processField('designation', 'ProfessionalDesignation', contact.designation)) isChanged = true;
            if (await processField('source', 'Source', contact.source)) isChanged = true;
            if (await processField('subSource', 'Sub-Source', contact.subSource)) isChanged = true;
            if (await processField('campaign', 'Campaign', contact.campaign)) isChanged = true;
            if (await processField('requirement', 'Requirement', contact.requirement)) isChanged = true;
            if (await processField('budget', 'Budget', contact.budget)) isChanged = true;
            if (await processField('location', 'Location', contact.location)) isChanged = true;

            // User
            if (contact.owner && !mongoose.Types.ObjectId.isValid(contact.owner)) {
                const resolvedUser = await resolveUser(contact.owner);
                if (resolvedUser) {
                    updates.owner = resolvedUser;
                    isChanged = true;
                }
            }

            // Addresses
            const processAddress = async (prefix, addr) => {
                if (!addr) return;
                const fields = ['country', 'state', 'city', 'tehsil', 'postOffice', 'location'];
                const types = {
                    country: 'Country',
                    state: 'State',
                    city: 'City',
                    tehsil: 'Tehsil',
                    postOffice: 'PostOffice',
                    location: 'Location'
                };
                for (const f of fields) {
                    if (addr[f] && !mongoose.Types.ObjectId.isValid(addr[f])) {
                        const resolved = await resolveLookup(types[f], addr[f]);
                        if (resolved) {
                            updates[`${prefix}.${f}`] = resolved;
                            isChanged = true;
                        }
                    }
                }
            };

            await processAddress('personalAddress', contact.personalAddress);
            await processAddress('correspondenceAddress', contact.correspondenceAddress);

            // Arrays (More complex to update via dot notation if we want partial updates, but we can just map the whole array)
            const processArray = async (path, itemFields) => {
                if (Array.isArray(contact[path])) {
                    let arrayChanged = false;
                    const newArray = await Promise.all(contact[path].map(async (item) => {
                        let itemChanged = false;
                        for (const [f, type] of Object.entries(itemFields)) {
                            if (item[f] && !mongoose.Types.ObjectId.isValid(item[f])) {
                                item[f] = await resolveLookup(type, item[f]);
                                itemChanged = true;
                                arrayChanged = true;
                            }
                        }
                        return item;
                    }));
                    if (arrayChanged) {
                        updates[path] = newArray;
                        isChanged = true;
                    }
                }
            };

            await processArray('educations', { education: 'Education', degree: 'Degree' });
            await processArray('loans', { loanType: 'LoanType', bank: 'Bank' });
            await processArray('socialMedia', { platform: 'SocialPlatform' });
            await processArray('incomes', { incomeType: 'IncomeType' });
            await processArray('documents', { documentCategory: 'Document-Category', documentType: 'Document-Type', documentName: 'Document-Type' });

            if (isChanged) {
                await collection.updateOne({ _id: contact._id }, { $set: updates });
                console.log(`[FIXED] Contact: ${contact.name} (${contact._id}) - Fields: ${Object.keys(updates).join(', ')}`);
            }
        }

        console.log("Normalization complete.");
    } catch (error) {
        console.error("Critical error:", error);
    } finally {
        await mongoose.disconnect();
    }
};

normalizeAllContacts();
