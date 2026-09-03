const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  const secret = process.env.JWT_SECRET;
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({ email: String, role: String, isActive: Boolean }, { strict: false }));
  const admin = await User.findOne({ isActive: true });
  const token = jwt.sign({ id: admin._id, role: admin.role }, secret, { expiresIn: '1h' });
  const fetch = (await import('node-fetch')).default;

  const res = await fetch(`http://localhost:4000/api/deals?limit=3&page=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
  });
  const json = await res.json();
  
  // Check first 3 records for key fields
  json.records.slice(0, 3).forEach((r, i) => {
    console.log(`=== Record ${i} ===`);
    console.log(`projectName: ${r.projectName}`);
    console.log(`unitNo: ${r.unitNo}`);
    console.log(`block: ${r.block || 'MISSING'}`);
    console.log(`sizeUnit: ${r.sizeUnit || 'MISSING'}`);
    console.log(`sizeLabel: ${r.sizeLabel || 'MISSING'}`);
    console.log(`sizeConfig: ${JSON.stringify(r.sizeConfig) || 'MISSING'}`);
    console.log(`owner: ${r.owner?.name || r.owner || 'MISSING'}`);
    console.log(`inventoryId type: ${typeof r.inventoryId}`);
    console.log(`inventoryId keys: ${r.inventoryId ? Object.keys(r.inventoryId).join(',') : 'NULL'}`);
    console.log(`category: ${JSON.stringify(r.category)}`);
    console.log(`status: ${JSON.stringify(r.status)}`);
    console.log(`intent: ${JSON.stringify(r.intent)}`);
  });
  
  process.exit(0);
}
run();
