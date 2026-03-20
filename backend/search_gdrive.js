import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const mongoUri = process.env.MONGODB_URI;

async function searchGDrive() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const collections = await mongoose.connection.db.collections();
        
        for (let col of collections) {
            console.log(`Searching in collection: ${col.collectionName}`);
            
            // Search for "GDRIVE:" in any field using a recursive regex if possible, 
            // but let's start with common image fields.
            const query = {
                $or: [
                    { projectImages: { $elemMatch: { path: /GDRIVE:/i } } },
                    { projectImages: { $elemMatch: { url: /GDRIVE:/i } } },
                    { inventoryImages: { $elemMatch: { path: /GDRIVE:/i } } },
                    { inventoryImages: { $elemMatch: { url: /GDRIVE:/i } } },
                    { 'projectImages.url': /GDRIVE:/i },
                    { 'projectImages.path': /GDRIVE:/i },
                    { 'inventoryImages.url': /GDRIVE:/i },
                    { 'inventoryImages.path': /GDRIVE:/i }
                ]
            };

            const found = await col.findOne(query);
            
            if (found) {
                console.log(`\n✅ MATCH FOUND in collection: ${col.collectionName}`);
                console.log(JSON.stringify(found, null, 2));
                // Just find one project/inventory to understand the structure
                if (col.collectionName === 'projects' || col.collectionName === 'inventories') {
                    process.exit(0);
                }
            }
        }

        console.log('No matches found for GDRIVE:');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

searchGDrive();
