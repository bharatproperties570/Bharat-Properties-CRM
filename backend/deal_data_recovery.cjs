const mongoose = require("mongoose");
const uri = "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";

mongoose.connect(uri).then(async () => {
    const db = mongoose.connection;
    const deals = await db.collection("deals").find().toArray();
    let fixedCount = 0;

    for (const deal of deals) {
        let updateNeeded = false;
        const updateDoc = {};

        if (deal.owner && typeof deal.owner === 'object' && !mongoose.Types.ObjectId.isValid(deal.owner)) {
            console.log(`Fixing owner for deal ${deal._id}`);
            updateDoc.owner = null;
            updateNeeded = true;
        }

        if (deal.associatedContact && typeof deal.associatedContact === 'object' && !mongoose.Types.ObjectId.isValid(deal.associatedContact)) {
            console.log(`Fixing associatedContact for deal ${deal._id}`);
            updateDoc.associatedContact = null;
            updateNeeded = true;
        }

        if (updateNeeded) {
            await db.collection("deals").updateOne({ _id: deal._id }, { $set: updateDoc });
            fixedCount++;
        }
    }

    console.log(`Successfully fixed ${fixedCount} deals.`);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
