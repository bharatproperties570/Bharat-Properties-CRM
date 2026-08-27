const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { performance } = require('perf_hooks');
dotenv.config();

async function run() {
  const secret = process.env.JWT_SECRET;
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  
  // Get two different users
  const users = await User.find({ isActive: true }).limit(2).lean();
  if (users.length < 2) {
    console.log("WARN: Only 1 active user, cannot test cross-user isolation");
    users.push(users[0]); // fallback
  }
  
  const tokenA = jwt.sign({ id: users[0]._id, role: users[0].role }, secret, { expiresIn: '1h' });
  const tokenB = jwt.sign({ id: users[1]._id, role: users[1].role }, secret, { expiresIn: '1h' });
  const fetch = (await import('node-fetch')).default;

  console.log(`User A: ${users[0]._id} (${users[0].fullName || users[0].email})`);
  console.log(`User B: ${users[1]._id} (${users[1].fullName || users[1].email})`);
  console.log("");

  // Test 1: User A cold hit
  let start = performance.now();
  let res = await fetch(`http://localhost:4000/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  let json = await res.json();
  console.log(`[User A - Call 1 (cold)] Latency: ${(performance.now() - start).toFixed(0)}ms | cached: ${json.cached || false} | soldCount: ${json.data?.performance?.soldCount}`);

  // Test 2: User A warm hit (should be cached)
  start = performance.now();
  res = await fetch(`http://localhost:4000/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  json = await res.json();
  console.log(`[User A - Call 2 (warm)] Latency: ${(performance.now() - start).toFixed(0)}ms | cached: ${json.cached || false} | soldCount: ${json.data?.performance?.soldCount}`);

  // Test 3: User B cold hit (different cache key, should NOT get A's cache)
  start = performance.now();
  res = await fetch(`http://localhost:4000/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  json = await res.json();
  console.log(`[User B - Call 1 (cold)] Latency: ${(performance.now() - start).toFixed(0)}ms | cached: ${json.cached || false} | soldCount: ${json.data?.performance?.soldCount}`);

  // Test 4: User B warm hit
  start = performance.now();
  res = await fetch(`http://localhost:4000/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  json = await res.json();
  console.log(`[User B - Call 2 (warm)] Latency: ${(performance.now() - start).toFixed(0)}ms | cached: ${json.cached || false} | soldCount: ${json.data?.performance?.soldCount}`);

  // Test 5: User A again (should still be cached from Test 1)
  start = performance.now();
  res = await fetch(`http://localhost:4000/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  json = await res.json();
  console.log(`[User A - Call 3 (warm)] Latency: ${(performance.now() - start).toFixed(0)}ms | cached: ${json.cached || false} | soldCount: ${json.data?.performance?.soldCount}`);

  process.exit(0);
}
run();
