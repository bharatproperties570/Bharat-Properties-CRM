import mongoose from 'mongoose';
import assert from 'assert';
import { evaluateConditions } from '../src/utils/distributionEngine.js'; // Actual R20 Engine Evaluator

function runTest() {
    console.log("Running Canonical ObjectId Condition Test...");

    const CAMPAIGN_OBJECT_ID = '698b3312861a01e0b08168ad';
    
    // The BSON ObjectId we want to migrate to in the rule
    const conditions = [{
        field: 'campaign',
        operator: 'equals',
        value: new mongoose.Types.ObjectId(CAMPAIGN_OBJECT_ID)
    }];

    // The Lead entity with the BSON ObjectId
    const leadMatch = {
        campaign: new mongoose.Types.ObjectId(CAMPAIGN_OBJECT_ID)
    };
    
    assert.strictEqual(evaluateConditions(conditions, leadMatch), true, "Evaluator MUST match BSON ObjectId exactly");

    // Negative Test
    const leadMismatch = {
        campaign: new mongoose.Types.ObjectId()
    };
    assert.strictEqual(evaluateConditions(conditions, leadMismatch), false, "Evaluator MUST NOT match wrong ObjectId");

    // Missing campaign
    const leadMissing = {};
    assert.strictEqual(evaluateConditions(conditions, leadMissing), false, "Evaluator MUST NOT match missing campaign");

    // String mismatch
    const stringConditions = [{
        field: 'campaign',
        operator: 'equals',
        value: 'Online'
    }];
    assert.strictEqual(evaluateConditions(stringConditions, leadMatch), false, "Evaluator MUST NOT match legacy string 'Online'");

    console.log("Canonical ObjectId Condition Test Passed.");
}
runTest();
