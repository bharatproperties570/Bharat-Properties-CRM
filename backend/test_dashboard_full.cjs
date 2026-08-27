const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { performance } = require('perf_hooks');
dotenv.config();

async function run() {
  const secret = process.env.JWT_SECRET;
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const admin = await User.findOne({ isActive: true });
  const token = jwt.sign({ id: admin._id, role: admin.role }, secret, { expiresIn: '1h' });
  const fetch = (await import('node-fetch')).default;

  // Flush cache
  const REDIS_PW = process.env.REDIS_PASSWORD;
  const Redis = require('ioredis');
  const redis = new Redis({ host: '127.0.0.1', port: 6379, password: REDIS_PW });
  const keys = await redis.keys('dashboard_kpis_v3*');
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();

  console.log("=== DASHBOARD FULL BASELINE ===");
  const start = performance.now();
  const res = await fetch(`http://localhost:4000/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
  });
  const text = await res.text();
  const duration = (performance.now() - start).toFixed(0);
  console.log(`HTTP: ${res.status}`);
  console.log(`Cold Latency: ${duration}ms`);
  console.log(`Payload: ${(text.length/1024).toFixed(1)} KB`);

  const json = JSON.parse(text);
  const d = json.data;
  console.log(`cached: ${json.cached || false}`);
  console.log(`soldCount: ${d.performance?.soldCount}`);
  console.log(`blockedCount: ${d.performance?.blockedCount}`);
  console.log(`overdue: ${d.activities?.overdue}`);
  console.log(`today: ${d.activities?.today}`);
  console.log(`upcoming: ${d.activities?.upcoming}`);
  console.log(`thisMonth: ${d.activities?.thisMonth}`);
  console.log(`leads: ${d.leads?.length}`);
  console.log(`deals: ${d.deals?.length}`);
  console.log(`inventoryHealth: ${d.inventoryHealth?.length}`);
  console.log(`projects: ${d.projects}`);
  console.log(`nfaCount: ${d.nfaCount}`);
  console.log(`reengagedCount: ${d.reengagedCount}`);
  console.log(`priceTrendDeals: ${d.priceTrendDeals?.length}`);
  console.log(`recentDeals: ${d.recentDeals?.length}`);
  console.log(`leadTrend.categories: ${d.leadTrend?.categories?.length}`);
  console.log(`cashFlow.categories: ${d.cashFlowProjection?.categories?.length}`);
  console.log(`revenueBySource.categories: ${d.revenueBySource?.categories?.length}`);
  console.log(`revenue: ${d.performance?.revenue}`);
  console.log(`pendingCommission: ${d.performance?.pendingCommission}`);
  console.log(`achieved: ${d.performance?.achieved}`);
  console.log(`total_property: ${d.total_property}`);
  console.log(`availability: ${d.availability}`);
  console.log(`agendaTasks: ${d.agenda?.tasks?.length}`);
  console.log(`agendaSiteVisits: ${d.agenda?.siteVisits?.length}`);
  console.log(`recentActivityFeed: ${d.recentActivityFeed?.length}`);
  console.log(`JSON keys: ${Object.keys(d).sort().join(',')}`);

  // Warm hit
  const start2 = performance.now();
  const res2 = await fetch(`http://localhost:4000/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
  });
  const json2 = await res2.json();
  console.log(`Warm Latency: ${(performance.now() - start2).toFixed(0)}ms | cached: ${json2.cached}`);

  process.exit(0);
}
run();
