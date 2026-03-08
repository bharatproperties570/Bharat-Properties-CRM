// Run from backend/ dir: node diag_sms.js
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';
const algorithm = 'aes-256-cbc';
const secretKey = process.env.JWT_SECRET || 'vEry_S3cure_D3f4ult_K3y_For_SMS_Encrpt10n';

function decrypt(hash) {
    if (!hash || !hash.iv || !hash.content) return hash;
    const decipher = crypto.createDecipheriv(
        algorithm,
        crypto.scryptSync(secretKey, 'salt', 32),
        Buffer.from(hash.iv, 'hex')
    );
    const decrypted = Buffer.concat([decipher.update(Buffer.from(hash.content, 'hex')), decipher.final()]);
    return decrypted.toString();
}

async function diagnose() {
    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Check SMS Providers
        const providers = await mongoose.connection.db.collection('smsproviders').find().toArray();
        console.log('=== SMS PROVIDERS ===');
        if (!providers.length) {
            console.log('❌ NO SMS PROVIDER FOUND IN DB! Please go to Settings > Integration > SMS and save config.');
        }
        providers.forEach(p => {
            const cfg = p.config || {};
            console.log(`\nProvider: ${p.provider}`);
            console.log(`  isActive: ${p.isActive} ${!p.isActive ? '❌ NOT ACTIVE' : '✅'}`);
            console.log(`  status: ${p.status}`);
            console.log(`  Config fields: ${Object.keys(cfg).join(', ')}`);

            // Try to decrypt sensitive fields
            Object.entries(cfg).forEach(([k, v]) => {
                if (v && typeof v === 'object' && v.iv) {
                    // Encrypted field
                    try {
                        const dec = decrypt(v);
                        console.log(`  ${k}: [ENCRYPTED] decrypted length=${dec.length} ${dec.length === 0 ? '❌ EMPTY!' : '✅'}`);
                    } catch (e) {
                        console.log(`  ${k}: [ENCRYPTED] ❌ FAILED TO DECRYPT: ${e.message}`);
                    }
                } else {
                    console.log(`  ${k}: ${v} ${!v ? '❌ EMPTY' : '✅'}`);
                }
            });
        });

        // Check SMS Templates
        const templates = await mongoose.connection.db.collection('smstemplates').find().toArray();
        console.log('\n=== SMS TEMPLATES ===');
        if (!templates.length) {
            console.log('❌ NO TEMPLATES FOUND!');
        }
        templates.forEach(t => {
            console.log(`  Name: ${t.name} | isActive: ${t.isActive} | dltTemplateId: ${t.dltTemplateId || 'NOT SET'} | body length: ${t.body?.length}`);
        });

        // Check SMS Logs (last 5)
        const logs = await mongoose.connection.db.collection('smslogs').find().sort({ createdAt: -1 }).limit(5).toArray();
        console.log('\n=== LAST 5 SMS LOGS ===');
        if (!logs.length) {
            console.log('  No SMS logs found (no SMS has ever been attempted)');
        }
        logs.forEach(l => {
            console.log(`  [${new Date(l.createdAt).toLocaleString()}] To: ${l.to} | Status: ${l.status} | Error: ${l.error || 'none'}`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

diagnose();
