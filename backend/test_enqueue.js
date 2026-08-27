import { enqueueAction } from './services/automationQueue/automationQueue.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('Sending test job to automation queue...');
    const result = await enqueueAction({ 
        action: { type: 'test' }, 
        entityData: { _id: 'test-entity' }, 
        trigger: { name: 'test-trigger' }, 
        companyId: 'test-company' 
    }, 1000);
    
    console.log('Enqueue Result:', result);
    process.exit(0);
}
run();
