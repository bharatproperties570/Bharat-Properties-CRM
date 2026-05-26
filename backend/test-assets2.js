import mongoose from 'mongoose';
import Company from './models/Company.js';
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const profCats = await Lookup.find({ lookup_type: 'ProfessionCategory' });
    console.log("ProfessionCategories:", profCats.map(l => l.lookup_value));

    const profSubCats = await Lookup.find({ lookup_type: 'ProfessionSubCategory' });
    console.log("ProfessionSubCategories:", profSubCats.map(l => l.lookup_value));

    const companies = await Company.find().select('name employees');
    console.log("Companies:", JSON.stringify(companies, null, 2));

    const contactsWithCompany = await Contact.find({ company: { $ne: null, $ne: "" } }).select('name company professionCategory professionSubCategory');
    console.log("Contacts with Company string:", contactsWithCompany);

    await mongoose.disconnect();
}
test();
