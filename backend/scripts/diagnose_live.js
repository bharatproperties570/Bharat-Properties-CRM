import mongoose from 'mongoose';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

// Load env from both root and backend
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

async function diagnose() {
    console.log('🔍 Starting Live API Diagnostics...\n');

    // 1. Check Environment Variables
    console.log('--- Environment Variables ---');
    const criticalVars = ['MONGODB_URI', 'PORT', 'JWT_SECRET', 'REDIS_HOST', 'REDIS_PORT'];
    criticalVars.forEach(v => {
        console.log(`${v}: ${process.env[v] ? '✅ Set' : '❌ MISSING'}`);
    });
    console.log('');

    // 2. MongoDB Connection
    console.log('--- MongoDB Connection ---');
    try {
        if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected Successfully');
        await mongoose.disconnect();
    } catch (err) {
        console.error(`❌ MongoDB Connection Failed: ${err.message}`);
    }
    console.log('');

    // 3. Redis Connection
    console.log('--- Redis Connection (BullMQ) ---');
    try {
        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            connectTimeout: 5000
        });

        const status = await new Promise((resolve) => {
            redis.on('connect', () => resolve('CONNECTED'));
            redis.on('error', (err) => resolve(`ERROR: ${err.message}`));
            setTimeout(() => resolve('TIMEOUT'), 6000);
        });

        if (status === 'CONNECTED') {
            console.log('✅ Redis Connected Successfully');
        } else {
            console.error(`❌ Redis Connection Failed: ${status}`);
            console.log('💡 Note: Enrichment and Forms require Redis to be running.');
        }
        redis.disconnect();
    } catch (err) {
        console.error(`❌ Redis Check Failed: ${err.message}`);
    }
    console.log('');

    console.log('--- Diagnostics Complete ---');
    process.exit(0);
}

diagnose();
