import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bharatproperties";

async function run() {
    try {
        await mongoose.connect(uri);
        console.log("Connected to MongoDB successfully!");

        // Find deals where offerHistory is populated but negotiationRounds is empty
        const deals = await Deal.find({
            offerHistory: { $exists: true, $not: { $size: 0 } }
        });

        console.log(`Analyzing ${deals.length} deals...`);
        let syncedCount = 0;

        for (let deal of deals) {
            const hasRounds = deal.negotiationRounds && deal.negotiationRounds.length > 0;
            
            // If rounds are empty or have fewer items than history, re-sync
            if (!hasRounds || deal.negotiationRounds.length < deal.offerHistory.length) {
                console.log(`Syncing deal ${deal._id} (${deal.projectName || 'Unnamed'}). Offer history: ${deal.offerHistory.length}`);
                
                deal.negotiationRounds = deal.offerHistory.map((offer, idx) => ({
                    round: idx + 1,
                    date: offer.date || new Date(),
                    offerBy: offer.offerBy || 'Buyer',
                    buyerOffer: offer.amount || 0,
                    ownerCounter: offer.counterAmount || 0,
                    status: offer.status || 'Active',
                    notes: offer.remarks || ''
                }));
                
                await deal.save();
                syncedCount++;
            }
        }

        console.log(`Sync complete. Updated ${syncedCount} deal(s).`);
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
