const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI || 'mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority')
  .then(async () => {
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const sizes = await Lookup.find({ lookup_type: 'Size' }).limit(5);
    console.log("=== OLD LOOKUP SAMPLES ===");
    console.log(sizes.map(s => ({ id: s._id, value: s.lookup_value })));
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
