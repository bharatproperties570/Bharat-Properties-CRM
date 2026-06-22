const mongoose = require('mongoose');
async function check() {
    await mongoose.connect('mongodb+srv://bharatpropertiescrm:bpcrm123@cluster0.pblx8.mongodb.net/bharatproperties');
    const db = mongoose.connection;
    const lookups = await db.collection('lookups').find().limit(5).toArray();
    console.log("DB Lookups Schema:", JSON.stringify(lookups, null, 2));
    process.exit(0);
}
check();
