import mongoose from 'mongoose';
mongoose.connect('mongodb://127.0.0.1:27017/bharat-properties-crm').then(async () => {
  const Contact = mongoose.model('Contact', new mongoose.Schema({}, {strict: false}), 'contacts');
  const c = await Contact.findOne({name: /salinder/i});
  console.log(JSON.stringify(c));
  process.exit(0);
});
