import assert from 'assert';
import { normalizeDistributionRulePayload, createDistributionRule, updateDistributionRule } from '../controllers/distributionRule.controller.js';
import DistributionRule from '../models/DistributionRule.js';
import User from '../models/User.js';
import Team from '../models/Team.js';
import mongoose from 'mongoose';

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

    User.find = (query) => ({
        lean: async () => query._id.$in.map(id => ({ _id: id, status: 'active', isActive: true, isDeleted: false }))
    });
    Team.find = (query) => ({
        lean: async () => query._id.$in.map(id => ({ _id: id, isActive: true, isDeleted: false }))
    });

    DistributionRule.findById = (id) => {
        findByIdCalledWith = id;
        return {
            lean: async () => ({
                _id: id,
                module: "leads",
                triggerEvent: ["onCreate", "onWebCapture"],
                assignmentTarget: { type: 'user', ids: ["69c4be0fd8c5cd0d6c90e999"] }
            })
        };
    };

    DistributionRule.findByIdAndUpdate = async (id, data, options) => {
        findByIdAndUpdateCalledWith = { id, data, options };
        return { _id: id, ...data };
    };

    const DUMMY_AGENT = "69c4be0fd8c5cd0d6c90e999";

    // 1. POST legacy payload WITHOUT triggerEvent (MUST reject HTTP 400)
    let req = mockReq({ entity: "lead", isActive: true, logic: "ROUND_ROBIN", assignedAgents: [DUMMY_AGENT] });
    let res = mockRes();
    createCalledWith = null;
    await createDistributionRule(req, res);
    assert.strictEqual(res.statusCode, 400, "MUST reject missing triggerEvent with HTTP 400");
    assert.strictEqual(createCalledWith, null, "MUST NOT call DistributionRule.create");

    // 2. POST Native R20 payload + triggerEvent => accepted
    req = mockReq({ module: "leads", enabled: true, triggerEvent: ["onCreate"], distributionType: "roundRobin", assignmentTarget: { type: 'user', ids: [DUMMY_AGENT] } });
    res = mockRes();
    await createDistributionRule(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.deepStrictEqual(createCalledWith.triggerEvent, ["onCreate"]);

    // 3. POST Legacy payload with explicit triggerEvent => accepted normalization
    req = mockReq({ entity: "lead", triggerEvent: ["onWebCapture"], assignedAgents: [DUMMY_AGENT] });
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

    // 7. PUT with duplicate target IDs => HTTP 400 and no write
    req = mockReq({ assignmentTarget: { type: 'user', ids: [DUMMY_AGENT, DUMMY_AGENT] } }, { id: "test_id" });
    res = mockRes();
    findByIdAndUpdateCalledWith = null;
    await updateDistributionRule(req, res);
    assert.strictEqual(res.statusCode, 400, "MUST reject duplicate target IDs with HTTP 400");
    assert.strictEqual(findByIdAndUpdateCalledWith, null, "MUST NOT call DistributionRule.findByIdAndUpdate on validation failure");

    // 8. POST with invalid fallback target => HTTP 400 and no write
    req = mockReq({ module: "leads", enabled: true, triggerEvent: ["onCreate"], assignmentTarget: { type: 'user', ids: [DUMMY_AGENT] }, fallbackTarget: { type: 'user', id: "invalid_id_format" } });
    res = mockRes();
    createCalledWith = null;
    await createDistributionRule(req, res);
    assert.strictEqual(res.statusCode, 400, "MUST reject invalid fallback target with HTTP 400");
    assert.strictEqual(createCalledWith, null, "MUST NOT call DistributionRule.create on validation failure");

    console.log("Controller HTTP Normalizer Tests Passed.");
}

runControllerTests().catch(console.error);
