import mongoose from 'mongoose';

const uri = "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";

async function check() {
    try {
        await mongoose.connect(uri);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;

        const unitTypes = await db.collection('lookups').find({ lookup_type: 'UnitType' }).toArray();
        console.log("UnitType Lookups:", unitTypes.map(u => u.lookup_value));

        const propertyTypes = await db.collection('lookups').find({ lookup_type: 'PropertyType' }).toArray();
        console.log("PropertyType Lookups:", propertyTypes.map(p => p.lookup_value));

        const settings = await db.collection('systemsettings').find({ key: 'masterFields' }).toArray();
        if (settings.length > 0) {
            console.log("masterFields.unitTypes in systemsettings:", settings[0].value.unitTypes);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
