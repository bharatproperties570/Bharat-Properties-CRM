import connectDB from './src/config/db.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('Testing connectDB...');
await connectDB();
console.log('Finished testing connectDB!');
process.exit(0);
