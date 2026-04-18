import mongoose from 'mongoose';
const uri = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';
async function run() {
  try {
    await mongoose.connect(uri);
    const Setting = mongoose.connection.collection('systemsettings');
    const waConfig = await Setting.findOne({ key: 'meta_wa_config' });
    console.log(JSON.stringify(waConfig, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
