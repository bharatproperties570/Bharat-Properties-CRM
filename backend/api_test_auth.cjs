const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { performance } = require('perf_hooks');
dotenv.config();

async function run() {
  const secret = process.env.JWT_SECRET;
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({ email: String, role: String, isActive: Boolean }, { strict: false }));
  
  // Find an ACTIVE admin to generate a valid token
  const admin = await User.findOne({ isActive: true });
  if (!admin) { console.error("No active user found"); process.exit(1); }
  
  const token = jwt.sign({ id: admin._id, role: admin.role }, secret, { expiresIn: '1h' });
  const fetch = (await import('node-fetch')).default || require('node-fetch');
  
  const endpoints = ['/api/dashboard/stats', '/api/inventory?limit=1', '/api/leads?limit=1', '/api/contacts?limit=1', '/api/deals?limit=1'];
  
  console.log("=== API PERFORMANCE & DATA TEST ===");
  for (let ep of endpoints) {
      const start = performance.now();
      try {
          const res = await fetch(`http://localhost:4000${ep}`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const json = await res.json();
          const duration = (performance.now() - start).toFixed(2);
          
          if(res.status === 200) {
              const dataLen = json.data ? (Array.isArray(json.data) ? json.data.length : 'Object') : (json.length || 'Object');
              console.log(`[PASS] ${ep} - Status: ${res.status}, Time: ${duration}ms, Data returned: Yes (${dataLen} records)`);
          } else {
              console.log(`[WARN] ${ep} - Status: ${res.status}, Msg: ${json.message || 'Unknown'}, Time: ${duration}ms`);
          }
      } catch (e) {
          console.log(`[FAIL] ${ep} - Error: ${e.message}`);
      }
  }
  
  process.exit(0);
}
run();
