const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  const secret = process.env.JWT_SECRET;
  if (!secret) { console.error("No JWT_SECRET"); process.exit(1); }
  
  // We need a valid user ID. Let's connect to Mongo and get one.
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({ email: String, role: String }, { strict: false }));
  const admin = await User.findOne({ role: 'admin' }) || await User.findOne({});
  if (!admin) { console.error("No user found"); process.exit(1); }
  
  const token = jwt.sign({ id: admin._id, role: admin.role }, secret, { expiresIn: '1h' });
  console.log("TOKEN_GENERATED");
  
  const fetch = (await import('node-fetch')).default || require('node-fetch');
  
  const endpoints = ['/api/inventory', '/api/leads', '/api/contacts', '/api/deals'];
  for (let ep of endpoints) {
      try {
          const res = await fetch(`http://localhost:4000${ep}`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const json = await res.json();
          console.log(`[${ep}] Status: ${res.status}, Keys: ${Object.keys(json).join(',')}`);
      } catch (e) {
          console.log(`[${ep}] Error: ${e.message}`);
      }
  }
  
  process.exit(0);
}
run();
