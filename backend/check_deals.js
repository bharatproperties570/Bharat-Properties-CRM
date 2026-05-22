import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const client = new MongoClient(process.env.MONGODB_URI);
async function run() {
  await client.connect();
  const db = client.db();
  const deals = await db.collection('deals').find({ 'builtupDetails.0': { $exists: true } }).toArray();
  deals.forEach(d => {
    console.log("Deal:", d.dealId || d.title || d._id);
    console.log(JSON.stringify(d.builtupDetails, null, 2));
  });
  process.exit(0);
}
run();
