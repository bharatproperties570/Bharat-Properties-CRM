import path from 'path';
import dotenv from 'dotenv';

// Load .env file from project root (one level up)
const envPath = path.resolve(process.cwd(), '..', '.env');
dotenv.config({ path: envPath });

const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // expose any other needed env vars here
};

export default config;
