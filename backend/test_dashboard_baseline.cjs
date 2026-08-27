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
  const fetch = (await import('node-fetch')).default || require('node-fetch');
  
  console.log("=== BASELINE METRICS ===");
  const start = performance.now();
  const res = await fetch(`http://localhost:4000/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
  });
  const json = await res.json();
  const duration = (performance.now() - start).toFixed(2);
  
  console.log(`Latency: ${duration}ms`);
  const data = json.data;
  console.log(`Activities: Overdue=${data.activities.overdue}, Today=${data.activities.today}, Upcoming=${data.activities.upcoming}`);
  console.log(`Inventory Health (Available/Sold/Blocked): ${JSON.stringify(data.inventoryHealth)}`);
  console.log(`Performance: soldCount=${data.performance.soldCount}, blockedCount=${data.performance.blockedCount}`);
  console.log(`PriceTrendDeals: Count=${data.priceTrendDeals ? data.priceTrendDeals.length : 0}`);
  
  process.exit(0);
}
run();
