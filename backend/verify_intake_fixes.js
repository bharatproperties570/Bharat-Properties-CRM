import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from './src/config/db.js';
import Intake from './models/Intake.js';
import { addToIntakeQueue } from './services/intakeQueue/IntakeQueue.js';

dotenv.config();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const run = async () => {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected.');

    const mockTenantId = new mongoose.Types.ObjectId();

    // Pre-cleanup of any prior WhatsApp test records
    await Intake.deleteMany({ source: 'WhatsApp' });

    console.log('\n--- 1. Testing Raw Content Ingestion Mapping ---');
    // Enqueue manual intake with some test text
    const testText = "3 BHK flat for sale in Aerocity price 90 lac";
    const result = await addToIntakeQueue('manual', { 
        text: testText, 
        source: 'WhatsApp', 
        tenantId: mockTenantId 
    });

    console.log('Enqueued job ID:', result.intakeId);

    // Wait for the mock worker to finish processing the job
    await sleep(2000);

    const record = await Intake.findById(result.intakeId);
    if (!record) {
        console.error('❌ Failed to retrieve the processed intake record!');
        process.exit(1);
    }

    console.log('DB Intake Raw Content (content):', record.content);
    console.log('DB Intake Description (description):', record.description);

    if (record.content === testText && record.description === testText) {
        console.log('✅ Ingestion correctly maps description to content for frontend compatibility!');
    } else {
        console.error('❌ Ingestion failed to populate content/description!');
        process.exit(1);
    }

    // ===============================================
    // 2. Testing AI Assistant Summary and Intent tags
    // ===============================================
    console.log('\n--- 2. Testing AI Assistant Insights ---');
    console.log('AI Assistant Summary:', record.ai_assistant?.summary);
    console.log('AI Assistant Seller Intent:', record.ai_assistant?.seller_intent);

    const summaryIsProper = record.ai_assistant?.summary && !record.ai_assistant.summary.includes('Unspecified');
    const intentIsProper = record.ai_assistant?.seller_intent === "Standard Seller Listing";

    if (summaryIsProper && intentIsProper) {
        console.log('✅ AI Assistant summary and seller intent formatted cleanly!');
    } else {
        console.error('❌ AI Assistant summary/intent fallback formatting is improper!');
        process.exit(1);
    }

    // Clean up
    await Intake.deleteOne({ _id: result.intakeId });
    console.log('\nCleanup complete.');

    console.log('\n🎉 ALL INTAKE UI DATA FIXES PASSED SUCCESSFULLY!');
    process.exit(0);
};

run().catch(err => {
    console.error('Unexpected error in verification script:', err);
    process.exit(1);
});
