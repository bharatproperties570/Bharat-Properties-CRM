import mongoose from 'mongoose';

const uri = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

async function run() {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(uri);
        console.log("Connected! Finding/Creating systemsettings collection entry...");

        const Setting = mongoose.connection.collection('systemsettings');

        const value = {
            "1": { "source": "customer_name", "mode": "static" },
            "2": { "source": "property_list_default", "mode": "static" },
            "3": { "source": "assignedTo", "mode": "static" }
        };

        const result = await Setting.findOneAndUpdate(
            { key: 'messaging_variable_registry' },
            {
                $set: {
                    category: 'messaging',
                    value: value,
                    description: 'Tiered variable registry (Static/Dynamic support)',
                    isPublic: true,
                    updatedAt: new Date()
                }
            },
            { upsert: true, returnDocument: 'after' }
        );

        console.log("Upserted successfully! Current Document state:");
        console.log(JSON.stringify(result, null, 2));

        process.exit(0);
    } catch (err) {
        console.error("Fatal Seeding Error:", err);
        process.exit(1);
    }
}

run();
