const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://bharatpropertiescrm:bpcrm123@cluster0.pblx8.mongodb.net/bharatproperties');
const db = mongoose.connection;
db.once('open', async () => {
    const col = db.collection('lookups');
    const facings = await col.find({ lookup_type: "Facing" }).toArray();
    console.log("Facings count:", facings.length);
    process.exit(0);
});
