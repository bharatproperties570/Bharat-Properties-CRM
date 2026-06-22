const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://bharatpropertiescrm:bpcrm123@cluster0.pblx8.mongodb.net/bharatproperties');
const db = mongoose.connection;
db.once('open', async () => {
    const col = db.collection('systemsettings');
    const doc = await col.findOne({ key: "activity_master_fields" });
    console.log(JSON.stringify(doc?.value?.activityPurposes, null, 2));
    process.exit(0);
});
