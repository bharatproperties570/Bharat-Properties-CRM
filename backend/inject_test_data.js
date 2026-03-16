import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Company from './models/Company.js';

dotenv.config({ path: '.env' });

async function injectTestData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const company = await Company.findOne();
        if (!company) {
            console.log('No company found to inject data into.');
            process.exit(0);
        }

        console.log(`Injecting data into company: ${company.name} (${company._id})`);

        company.documents = [
            { name: 'Live Certificate.pdf', type: 'Incorporation', url: 'https://example.com/cert.pdf' },
            { name: 'Live GST.pdf', type: 'GST', url: 'https://example.com/gst.pdf' }
        ];

        company.incentiveSlabs = [
            { slabName: 'Silver Tier', minRevenue: 0, maxRevenue: 50000000, kicker: 0.5 },
            { slabName: 'Gold Tier', minRevenue: 50000000, maxRevenue: 100000000, kicker: 1.0 },
            { slabName: 'Platinum Tier', minRevenue: 100000000, maxRevenue: 500000000, kicker: 2.0 }
        ];

        company.agreementDetails = {
            agreementType: 'Exclusive Channel Partner',
            validUntil: new Date('2026-12-31'),
            standardCommission: '3.0% + GST',
            terms: 'Net 30 payment terms.'
        };

        company.partnerScore = 88;
        company.commissionAgreementStatus = 'Active';

        await company.save();
        console.log('Sample data injected successfully!');
        
        process.exit(0);
    } catch (err) {
        console.error('Error injecting data:', err);
        process.exit(1);
    }
}

injectTestData();
