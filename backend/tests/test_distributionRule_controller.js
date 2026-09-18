import assert from 'assert';
import { normalizeDistributionRulePayload } from '../controllers/distributionRule.controller.js';

function runControllerTests() {
    console.log("Running Controller Normalizer Tests...");

    // POST / CREATE - A. Native R20 payload
    const r20Payload = {
        module: 'leads',
        enabled: true,
        triggerEvent: ['onCreate'],
        distributionType: 'roundRobin'
    };
    const r20Normalized = normalizeDistributionRulePayload(r20Payload);
    assert.deepStrictEqual(r20Normalized.triggerEvent, ['onCreate']);

    // POST / CREATE - B. Legacy payload WITH triggerEvent
    const legacyWithTrigger = {
        entity: 'lead',
        isActive: true,
        logic: 'ROUND_ROBIN',
        assignedAgents: ['agent1'],
        triggerEvent: ['onWebCapture']
    };
    const legacyWithTriggerNormalized = normalizeDistributionRulePayload(legacyWithTrigger);
    assert.strictEqual(legacyWithTriggerNormalized.module, 'leads');
    assert.strictEqual(legacyWithTriggerNormalized.enabled, true);
    assert.strictEqual(legacyWithTriggerNormalized.distributionType, 'roundRobin');
    assert.deepStrictEqual(legacyWithTriggerNormalized.assignmentTarget.ids, ['agent1']);
    assert.deepStrictEqual(legacyWithTriggerNormalized.triggerEvent, ['onWebCapture']);

    // POST / CREATE - C/D. Legacy payload WITHOUT triggerEvent
    const legacyNoTrigger = { entity: 'lead' };
    const legacyNoTriggerNormalized = normalizeDistributionRulePayload(legacyNoTrigger);
    assert.strictEqual(legacyNoTriggerNormalized.triggerEvent, undefined, "Must NOT silently invent triggerEvent");

    // PUT / UPDATE - A. Existing rule has triggers, legacy omits
    const existingRuleMulti = { triggerEvent: ["onCreate", "onWebCapture"] };
    const updatePayloadLegacy = { entity: 'lead' }; // no trigger
    const updatedMulti = normalizeDistributionRulePayload(updatePayloadLegacy, existingRuleMulti);
    assert.deepStrictEqual(updatedMulti.triggerEvent, ["onCreate", "onWebCapture"], "Existing triggerEvent must be preserved");

    // PUT / UPDATE - B. Existing rule has single trigger, legacy omits
    const existingRuleSingle = { triggerEvent: ["onCreate"] };
    const updatedSingle = normalizeDistributionRulePayload(updatePayloadLegacy, existingRuleSingle);
    assert.deepStrictEqual(updatedSingle.triggerEvent, ["onCreate"], "Existing single triggerEvent must be preserved");

    // PUT / UPDATE - C. Explicit new triggerEvent supplied
    const updatePayloadWithTrigger = { entity: 'lead', triggerEvent: ["onWebCapture"] };
    const updatedExplicit = normalizeDistributionRulePayload(updatePayloadWithTrigger, existingRuleMulti);
    assert.deepStrictEqual(updatedExplicit.triggerEvent, ["onWebCapture"], "Explicit new triggerEvent must be used");

    // PUT / UPDATE - D. Verify req.body is NOT mutated
    const originalBody = { entity: 'lead' };
    normalizeDistributionRulePayload(originalBody, existingRuleMulti);
    assert.deepStrictEqual(originalBody, { entity: 'lead' }, "req.body MUST NOT be mutated");

    console.log("Controller Normalizer Tests Passed.");
}

runControllerTests();
