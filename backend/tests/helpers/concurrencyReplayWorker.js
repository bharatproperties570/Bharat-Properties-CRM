/**
 * concurrencyReplayWorker.js
 * 
 * Standalone worker process used by test_backend_social_compliance_enforcement.test.js
 * to verify multi-process distributed atomic replay protection against MongoDB.
 */

import mongoose from 'mongoose';
import { recordNonceConsumptionDurable } from '../../services/MarketingComplianceEnforcementService.js';

const mongoUri = process.argv[2];
const signature = process.argv[3];
const record = JSON.parse(process.argv[4]);

async function main() {
    try {
        await mongoose.connect(mongoUri);
        const res = await recordNonceConsumptionDurable(signature, record);
        await mongoose.disconnect();

        if (res.consumed && !res.isIdempotentRetry) {
            process.send ? process.send({ success: true, pid: process.pid }) : console.log(JSON.stringify({ success: true }));
            process.exit(0);
        } else {
            process.send ? process.send({ success: false, error: res.error, pid: process.pid }) : console.log(JSON.stringify({ success: false, error: res.error }));
            process.exit(1);
        }
    } catch (err) {
        process.send ? process.send({ success: false, error: err.message, pid: process.pid }) : console.error(err.message);
        process.exit(2);
    }
}

main();
