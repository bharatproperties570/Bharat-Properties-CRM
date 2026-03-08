import mongoose from 'mongoose';

const uri = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

async function cleanup() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(uri);
        const db = mongoose.connection.db;
        const lookupsCollection = db.collection('lookups');

        const areaLabels = [
            '1 Kanal', '2 Kanal', '4 Kanal', '1 Acre', '10 Marla', '12 Marla',
            '14 Marla', '16 Marla', '8 Marla', '6 Marla', '5 Marla', '4 Marla',
            '3 Marla', '2 Marla', '5 Marla Side', '6 Marla Side'
        ];

        console.log('Identifying redundant lookup entries in Facing and UnitType...');
        const toDelete = await lookupsCollection.find({
            lookup_type: { $in: ['UnitType', 'Unit Type', 'Facing'] },
            lookup_value: { $in: areaLabels }
        }).toArray();

        if (toDelete.length === 0) {
            console.log('No redundant entries found.');
        } else {
            console.log(`Found ${toDelete.length} entries to delete:`);
            toDelete.forEach(d => console.log(` - [${d.lookup_type}] ${d.lookup_value}`));

            const result = await lookupsCollection.deleteMany({
                _id: { $in: toDelete.map(d => d._id) }
            });
            console.log(`Successfully deleted ${result.deletedCount} entries.`);
        }

        // Also check masterFields in systemsettings
        console.log('Checking masterFields in systemsettings...');
        const settingsCollection = db.collection('systemsettings');
        const settings = await settingsCollection.findOne({ key: 'masterFields' });

        if (settings && settings.value) {
            const fieldsToClean = ['unitTypes', 'facings'];
            let updated = false;

            for (const field of fieldsToClean) {
                if (Array.isArray(settings.value[field])) {
                    const originalCount = settings.value[field].length;
                    const cleaned = settings.value[field].filter(val => !areaLabels.includes(val));

                    if (cleaned.length !== originalCount) {
                        console.log(`Cleaning masterFields.${field}: ${originalCount} -> ${cleaned.length}`);
                        settings.value[field] = cleaned;
                        updated = true;
                    }
                }
            }

            if (updated) {
                await settingsCollection.updateOne(
                    { _id: settings._id },
                    { $set: { 'value': settings.value } }
                );
                console.log('masterFields updated successfully.');
            } else {
                console.log('masterFields already clean.');
            }
        }

        console.log('Cleanup complete.');
    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        process.exit(0);
    }
}

cleanup();
