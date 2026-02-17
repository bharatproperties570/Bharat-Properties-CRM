import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Company from './models/Company.js';
import Lookup from './models/Lookup.js';

dotenv.config();

async function debugCompanies() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const companies = await Company.find({
            $or: [
                { 'addresses.registeredOffice': { $exists: true, $ne: null } },
                { 'addresses.headOffice': { $exists: true, $ne: null } },
                { 'addresses.corporateOffice': { $exists: true, $ne: null } },
                { 'addresses.branchOffice.0': { $exists: true } },
                { 'addresses.siteOffice.0': { $exists: true } }
            ]
        }).populate([
            { path: 'addresses.registeredOffice.city', select: 'lookup_value' },
            { path: 'addresses.registeredOffice.state', select: 'lookup_value' },
            { path: 'addresses.registeredOffice.country', select: 'lookup_value' },
            { path: 'addresses.registeredOffice.tehsil', select: 'lookup_value' },
            { path: 'addresses.registeredOffice.postOffice', select: 'lookup_value' },
            { path: 'addresses.registeredOffice.location', select: 'lookup_value' },
            { path: 'addresses.headOffice.city', select: 'lookup_value' },
            { path: 'addresses.headOffice.state', select: 'lookup_value' },
            { path: 'addresses.corporateOffice.city', select: 'lookup_value' },
            { path: 'addresses.corporateOffice.state', select: 'lookup_value' }
        ]).limit(5);

        console.log(`Found ${companies.length} companies`);

        companies.forEach((company, index) => {
            console.log(`\n--- Company ${index + 1}: ${company.name} ---`);
            Object.keys(company.addresses || {}).forEach(key => {
                if (company.addresses[key]) {
                    console.log(`${key}:`, JSON.stringify(company.addresses[key], null, 2));
                }
            });
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

debugCompanies();
