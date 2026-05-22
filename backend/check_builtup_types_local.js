import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;
mongoose.connect(uri)
    .then(async () => {
        console.log('Connected to MONGODB');
        const db = mongoose.connection.db;
        
        // Find distinct cluster names in inventories
        const allClustersInv = new Set();
        const allInv = await db.collection('inventories').find({ 'builtupDetails.cluster': { $exists: true } }).toArray();
        allInv.forEach(i => {
            if (Array.isArray(i.builtupDetails)) {
                i.builtupDetails.forEach(d => {
                    if (d.cluster) allClustersInv.add(d.cluster);
                });
            }
        });
        console.log('All unique clusters in inventories:', Array.from(allClustersInv));

        // Find distinct cluster names in deals
        const allClustersDeals = new Set();
        const allDeals = await db.collection('deals').find({ 'builtupDetails.cluster': { $exists: true } }).toArray();
        allDeals.forEach(i => {
            if (Array.isArray(i.builtupDetails)) {
                i.builtupDetails.forEach(d => {
                    if (d.cluster) allClustersDeals.add(d.cluster);
                });
            }
        });
        console.log('All unique clusters in deals:', Array.from(allClustersDeals));

        // Print sample deal with builtupDetails
        const sampleDeal = await db.collection('deals').findOne({ builtupDetails: { $exists: true, $not: { $size: 0 } } });
        if (sampleDeal) {
            console.log('Sample Deal builtupDetails:', JSON.stringify(sampleDeal.builtupDetails, null, 2));
        } else {
            console.log('No deal found with non-empty builtupDetails');
        }

        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
