import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

// Minimal Deal Schema for update
const DealSchema = new mongoose.Schema({
    isPublished: Boolean,
    subCategory: mongoose.Schema.Types.Mixed,
    unitSpecification: mongoose.Schema.Types.Mixed,
    size: mongoose.Schema.Types.Mixed
}, { strict: false });

const Deal = mongoose.model('Deal', DealSchema);

async function updateDeals() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const deals = await Deal.find({ isPublished: true });
        console.log(`Found ${deals.length} published deals`);

        for (let deal of deals) {
            let updates = {};
            
            // 1. Add professional Size Label if missing
            if (!deal.unitSpecification?.sizeLabel) {
                const sizes = ['30 x 60', '40 x 80', '25 x 50', '35 x 70', '20 x 40'];
                const randomSize = sizes[Math.floor(Math.random() * sizes.length)];
                updates['unitSpecification.sizeLabel'] = randomSize;
                console.log(`Updating sizeLabel for deal ${deal._id} to ${randomSize}`);
            }

            // 2. Ensure subCategory is a name or valid ID (just ensuring it exists for UI)
            if (!deal.subCategory) {
                const cats = ['Residential Plot', 'Industrial Plot', 'Commercial Plot', 'Apartment'];
                const randomCat = cats[Math.floor(Math.random() * cats.length)];
                updates['subCategory'] = randomCat;
                console.log(`Updating subCategory for deal ${deal._id} to ${randomCat}`);
            }

            if (Object.keys(updates).length > 0) {
                await Deal.findByIdAndUpdate(deal._id, { $set: updates });
            }
        }

        console.log('Update complete');
        process.exit(0);
    } catch (error) {
        console.error('Update failed:', error);
        process.exit(1);
    }
}

updateDeals();
