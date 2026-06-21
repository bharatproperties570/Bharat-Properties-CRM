import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = (await import('./models/Lead.js')).default;
    const Deal = (await import('./models/Deal.js')).default;

    const deals = await Deal.find({ projectName: /37/i }).populate('inventoryId location locationDetails.city category subCategory sizeType unitType').lean();
    console.log(`Found ${deals.length} deals matching '37'`);
    for (const deal of deals) {
        console.log('--- DEAL ---');
        console.log('ID:', deal._id);
        console.log('Project:', deal?.projectName);
        console.log('Category:', deal?.category?.lookup_value);
        console.log('SubCat:', deal?.subCategory?.lookup_value);
        console.log('SizeType:', deal?.sizeType?.lookup_value);
        console.log('UnitType:', deal?.unitType?.lookup_value);
        console.log('Price:', deal?.price);
        console.log('Sector:', deal?.sector);
        console.log('Locality:', deal?.location?.lookup_value || deal?.inventoryId?.address?.locality?.lookup_value);
    }

    const leads = await Lead.find({ firstName: { $in: [ /Naman/i, /Om/i, /Baldev/i ] } })
        .populate('propertyType subType sizeType unitType location requirement')
        .lean();
    
    console.log('\n--- LEADS ---');
    for (const l of leads) {
        console.log('\nName:', l.firstName, l.lastName);
        console.log('Budget:', l.budgetMin, '-', l.budgetMax);
        console.log('Category:', l.propertyType?.map(c=>c?.lookup_value).join(', '));
        console.log('SubCat:', l.subType?.map(c=>c?.lookup_value).join(', '));
        console.log('SizeType:', l.sizeType?.map(c=>c?.lookup_value).join(', '));
        console.log('UnitType:', l.unitType?.map(c=>c?.lookup_value).join(', '));
        console.log('Location:', l.location?.lookup_value, '| locCity:', l.locCity, '| Sector:', l.sector, '| Project:', l.projectName);
    }
    process.exit(0);
}
run();
