import assert from 'assert';
import { normalizeDistributionRulePayload, createDistributionRule, updateDistributionRule } from '../controllers/distributionRule.controller.js';
import DistributionRule from '../models/DistributionRule.js';

async function runControllerTests() {
    console.log("Running Controller HTTP Normalizer Tests...");

    // Mock Express Request and Response
    const mockReq = (body, params = {}) => ({ body, params });
    const mockRes = () => {
        const res = {};
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => { res.data = data; return res; };
        return res;
    };

    // Override Mongoose methods for testing
    let createCalledWith = null;
    let findByIdCalledWith = null;
    let findByIdAndUpdateCalledWith = null;

    DistributionRule.create = async (data) => {
        createCalledWith = data;
        return { _id: "created_id", ...data };
    };

    DistributionRule.findById = (id) => {
        findByIdCalledWith = id;
        return {
            lean: async () => ({
                _id: id,
                module: "leads",
                triggerEvent: ["onCreate", "onWebCapture"]
            })
        };
    };

    DistributionRule.findByIdAndUpdate = async (id, data, options) => {
        findByIdAndUpdateCalledWith = { id, data, options };
        return { _id: id, ...data };
    };

    // 1. POST legacy payload WITHOUT triggerEvent (MUST reject HTTP 400)
    let req = mockReq({ entity: "lead", isActive: true, logic: "ROUND_ROBIN", assignedAgents: ["agent1"] });
    let res = mockRes();
    createCalledWith = null;
    await createDistributionRule(req, res);
    assert.strictEqual(res.statusCode, 400, "MUST reject missing triggerEvent with HTTP 400");
    assert.strictEqual(createCalledWith, null, "MUST NOT call DistributionRule.create");

    // 2. POST Native R20 payload + triggerEvent => accepted
    req = mockReq({ module: "leads", enabled: true, triggerEvent: ["onCreate"], distributionType: "roundRobin" });
    res = mockRes();
    await createDistributionRule(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.deepStrictEqual(createCalledWith.triggerEvent, ["onCreate"]);

    // 3. POST Legacy payload with explicit triggerEvent => accepted normalization
    req = mockReq({ entity: "lead", triggerEvent: ["onWebCapture"] });
    res = mockRes();
    await createDistributionRule(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(createCalledWith.module, "leads");
    assert.deepStrictEqual(createCalledWith.triggerEvent, ["onWebCapture"]);

    // 4. PUT Legacy payload without triggerEvent + existing rule => existing triggerEvent preserved
    req = mockReq({ entity: "lead" }, { id: "test_id" });
    res = mockRes();
    await updateDistributionRule(req, res);
    assert.deepStrictEqual(findByIdAndUpdateCalledWith.data.triggerEvent, ["onCreate", "onWebCapture"]);

    // 5. PUT Explicit triggerEvent => explicit value used
    req = mockReq({ entity: "lead", triggerEvent: ["onWhatsAppCapture"] }, { id: "test_id" });
    res = mockRes();
    await updateDistributionRule(req, res);
    assert.deepStrictEqual(findByIdAndUpdateCalledWith.data.triggerEvent, ["onWhatsAppCapture"]);

    // 6. req.body MUST NOT mutate
    const originalBody = { entity: "lead" };
    req = mockReq(originalBody);
    res = mockRes();
    await createDistributionRule(req, res); // will return 400
    assert.deepStrictEqual(originalBody, { entity: "lead" }, "req.body MUST NOT be mutated");

    console.log("Controller HTTP Normalizer Tests Passed.");
}

runControllerTests().catch(console.error);
