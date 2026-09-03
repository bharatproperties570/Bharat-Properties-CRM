const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { performance } = require('perf_hooks');
dotenv.config();

async function run() {
  const secret = process.env.JWT_SECRET;
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({ email: String, role: String, isActive: Boolean }, { strict: false }));
  const admin = await User.findOne({ isActive: true });
  const token = jwt.sign({ id: admin._id, role: admin.role }, secret, { expiresIn: '1h' });
  const fetch = (await import('node-fetch')).default;

  console.log("=== DEALS BASELINE ===");
  
  // Cold hit (flush cache first)
  const start = performance.now();
  const res = await fetch(`http://localhost:4000/api/deals?limit=25&page=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
  });
  const text = await res.text();
  const duration = (performance.now() - start).toFixed(2);
  
  console.log(`HTTP Status: ${res.status}`);
  console.log(`Latency: ${duration}ms`);
  console.log(`Response Size: ${(text.length / 1024).toFixed(1)} KB`);
  
  try {
    const json = JSON.parse(text);
    console.log(`Records: ${json.records?.length || 0}`);
    console.log(`TotalCount: ${json.totalCount || 0}`);
    console.log(`TotalPages: ${json.totalPages || 0}`);
    console.log(`CategoryStats: ${json.categoryStats?.length || 0}`);
    console.log(`Success: ${json.success}`);
    console.log(`Keys: ${Object.keys(json).join(',')}`);
    if (json.records?.[0]) {
      console.log(`First Record Keys: ${Object.keys(json.records[0]).join(',')}`);
    }
  } catch(e) {
    console.log(`Parse Error: ${e.message}`);
    console.log(`First 500 chars: ${text.substring(0, 500)}`);
  }
  
  process.exit(0);
}
run();
