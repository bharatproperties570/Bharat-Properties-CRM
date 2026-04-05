import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function cleanupLookups() {
    try {
        console.log('[Cleanup] Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_realestate');
        
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String,
            parent_lookup_id: mongoose.Schema.Types.ObjectId,
            isActive: Boolean
        }));

        const allLookups = await Lookup.find({}).lean();
        console.log(`[Cleanup] Found ${allLookups.length} total lookups.`);

        let updatedCount = 0;
        for (const lookup of allLookups) {
            const originalValue = lookup.lookup_value || '';
            const trimmedValue = originalValue.trim();

            if (originalValue !== trimmedValue) {
                await Lookup.findByIdAndUpdate(lookup._id, { lookup_value: trimmedValue });
                console.log(`[Cleanup] Trimmed ID: ${lookup._id} | From: "${originalValue}" | To: "${trimmedValue}"`);
                updatedCount++;
            }
        }

        console.log(`[Cleanup] Successfully trimmed ${updatedCount} lookups.`);
        
        // Optional: Log remaining duplicates with same parent
        const buildupLookups = await Lookup.find({ lookup_type: 'BuiltupType' }).lean();
        const seen = new Map(); // Map<parentId+value, id>
        
        buildupLookups.forEach(l => {
            const key = `${l.parent_lookup_id}_${l.lookup_value}`;
            if (seen.has(key)) {
                console.warn(`[Warning] Possible DUPLICATE with same parent: "${l.lookup_value}" | Parent: ${l.parent_lookup_id} | IDs: ${seen.get(key)} & ${l._id}`);
            } else {
                seen.set(key, l._id);
            }
        });

        process.exit(0);
    } catch (error) {
        console.error('[Cleanup] Error:', error);
        process.exit(1);
    }
}

cleanupLookups();
