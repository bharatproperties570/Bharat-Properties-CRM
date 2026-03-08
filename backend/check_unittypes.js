const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/bharat-properties-crm')
  .then(async () => {
    const db = mongoose.connection.db;
    const items = await db.collection('lookups').find({ lookup_type: 'UnitType' }).toArray();
    console.log("Db UnitTypes:", items.map(i => i.lookup_value));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
