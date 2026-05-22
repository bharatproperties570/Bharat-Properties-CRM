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
  const users = await db.collection('users').find({ status: { $ne: 'suspended' } }).toArray();
  console.log('Active User ID:', users[0]._id);
  process.exit(0);
}
run();
