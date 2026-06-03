import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import Lead from './models/Lead.js';
import Deal from './models/Deal.js';
import Inventory from './models/Inventory.js';
import Project from './models/Project.js';

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB for Geo Migration...");

        const models = [
            { name: 'Lead', model: Lead, latField: 'locLat', lngField: 'locLng' },
            { name: 'Deal', model: Deal, latField: 'latitude', lngField: 'longitude' },
            { name: 'Inventory', model: Inventory, latField: 'latitude', lngField: 'longitude' },
            { name: 'Project', model: Project, latField: 'latitude', lngField: 'longitude' },
        ];

        for (const { name, model, latField, lngField } of models) {
            const docs = await model.find({ [latField]: { $exists: true, $ne: "" }, [lngField]: { $exists: true, $ne: "" }, geoPoint: { $exists: false } });
            console.log(`Found ${docs.length} ${name} documents needing GeoJSON migration.`);
            
            let updated = 0;
            for (const doc of docs) {
                const lat = parseFloat(doc[latField]);
                const lng = parseFloat(doc[lngField]);
                if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    await model.findByIdAndUpdate(doc._id, {
                        $set: {
                            geoPoint: { type: 'Point', coordinates: [lng, lat] }
                        }
                    });
                    updated++;
                }
            }
            console.log(`Successfully migrated ${updated} ${name} documents.`);
        }

        console.log("Geo Migration Complete.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

run();
