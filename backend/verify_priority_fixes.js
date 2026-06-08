import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import { parseContent, getDynamicPatterns } from './src/modules/intake/intakeParser.js';
import duplicateIntelligenceEngine from './services/intakeVerification/DuplicateIntelligenceEngine.js';
import Intake from './models/Intake.js';
import ParsingRule from './src/modules/parsing/parsingRule.model.js';
import DealVerificationService from './services/DealVerificationService.js';
import unifiedAIService from './services/UnifiedAIService.js';

dotenv.config();

const run = async () => {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected.');

    // 1. Verify parseContent contact extraction
    console.log('\n--- 1. Testing parseContent extraction ---');
    const testText = "Looking for flat in Mohali, contact +919876543210 or 09988776655";
    const parsed = await parseContent(testText);
    console.log('Parsed contact_numbers:', parsed.contact_numbers);
    if (parsed && Array.isArray(parsed.contact_numbers) && parsed.contact_numbers.includes('9876543210') && parsed.contact_numbers.includes('9988776655')) {
        console.log('✅ contact_numbers correctly returned in parsedResult!');
    } else {
        console.error('❌ contact_numbers missing or incorrect in parsedResult:', parsed?.contact_numbers);
        process.exit(1);
    }

    // 2. Verify DuplicateIntelligenceEngine normalization
    console.log('\n--- 2. Testing DuplicateIntelligenceEngine normalization ---');
    // Create a temporary Intake record in DB with normalized numbers
    const tempIntake = new Intake({
        source: 'Test',
        source_type: 'manual',
        status: 'Processed',
        contact_numbers: ['9876543210'],
        location: 'Mohali',
        price: '1.2 Cr',
        title: 'Test Duplicate Ingestion'
    });
    await tempIntake.save();
    console.log('Saved temporary candidate intake with phone 9876543210.');

    try {
        const newRecordMock = {
            _id: '000000000000000000000000', // Mock ObjectId
            contact_numbers: ['+91 98765 43210'],
            location: 'Mohali',
            price: '1.2 Cr',
            title: 'Test Inbound Duplicate'
        };

        const dupResult = await duplicateIntelligenceEngine.analyze(newRecordMock);
        console.log('Duplicate analyze result:', JSON.stringify(dupResult, null, 2));

        if (dupResult.duplicate_probability >= 40 && dupResult.possible_duplicate_ids.some(id => id.toString() === tempIntake._id.toString())) {
            console.log('✅ Duplicate detected successfully using normalized phone formats!');
        } else {
            console.error('❌ Duplicate detection failed on normalized phone formats!');
            process.exit(1);
        }
    } finally {
        await Intake.deleteOne({ _id: tempIntake._id });
        console.log('Cleaned up temporary candidate intake.');
    }

    // 3. Verify getDynamicPatterns caching and cache invalidation
    console.log('\n--- 3. Testing patterns caching and cache invalidation ---');
    const start1 = Date.now();
    await getDynamicPatterns(true); // Bypass cache first to populate it
    const elapsed1 = Date.now() - start1;
    console.log(`Initial getDynamicPatterns (DB query) took: ${elapsed1}ms`);

    const start2 = Date.now();
    await getDynamicPatterns(); // Should hit cache
    const elapsed2 = Date.now() - start2;
    console.log(`Cached getDynamicPatterns took: ${elapsed2}ms`);

    // Invalidate cache by calling dynamic rule creation simulation
    // Let's create a temporary rule
    const ruleMock = new ParsingRule({
        type: 'CITY',
        value: 'TestCityCacheInvalidate',
        category: 'Test'
    });
    await ruleMock.save();
    console.log('Created temporary rule. Triggering cache clear...');

    // Since we call ruleMock.save() directly, we should manually clear cache or test getRules/addRules controller
    const { clearPatternsCache } = await import('./src/modules/intake/intakeParser.js');
    clearPatternsCache();

    const patternsAfterInvalidate = await getDynamicPatterns();
    console.log('Patterns after invalidation contains TestCityCacheInvalidate:', patternsAfterInvalidate.CITY.test('TestCityCacheInvalidate'));

    if (patternsAfterInvalidate.CITY.test('TestCityCacheInvalidate')) {
        console.log('✅ Cache invalidation works correctly!');
    } else {
        console.error('❌ Cache invalidation failed!');
        process.exit(1);
    }

    await ParsingRule.deleteOne({ _id: ruleMock._id });
    clearPatternsCache(); // Clear again
    console.log('Cleaned up temporary rule.');

    // 4. Verify Unified AI failover code import in DealVerificationService
    console.log('\n--- 4. Verify DealVerificationService integrates unifiedAIService ---');
    try {
        console.log('Calling DealVerificationService._parseWithAI...');
        const originalGenerate = unifiedAIService.generate;
        let callCount = 0;
        unifiedAIService.generate = async (prompt, opts) => {
            callCount++;
            return JSON.stringify({
                intent: 'CONFIRMED',
                correctedData: { price: null, projectName: null, dealIntent: null },
                replyMessage: 'Stubbed message',
                requiresAgentFollowup: false,
                agentNote: null
            });
        };

        const result = await DealVerificationService._parseWithAI('Haan main khareedna chahta hoon', [], 'verify-trace');
        console.log('DealVerificationService intent result:', result);

        unifiedAIService.generate = originalGenerate; // Restore

        if (callCount === 1 && result.intent === 'CONFIRMED') {
            console.log('✅ DealVerificationService successfully integrated and called unifiedAIService!');
        } else {
            console.error('❌ DealVerificationService failover verification failed!');
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ DealVerificationService call threw an error:', err);
        process.exit(1);
    }

    console.log('\n🎉 ALL PRIORITY 1 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
};

run().catch(err => {
    console.error('Unhandled verification error:', err);
    process.exit(1);
});
