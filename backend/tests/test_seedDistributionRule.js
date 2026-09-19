import assert from 'assert';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Team from '../models/Team.js';
import DistributionRule from '../models/DistributionRule.js';

// Mock mongoose connect
mongoose.connect = async () => { return true; };

// Mock DistributionRule
let createdOrUpdatedRule = null;
DistributionRule.findOne = () => ({
    toObject: () => ({})
});
DistributionRule.findByIdAndUpdate = async (id, data) => {
    createdOrUpdatedRule = data;
    return data;
};
DistributionRule.create = async (data) => {
    createdOrUpdatedRule = data;
    return data;
};

// Mock User & Team
User.find = (query) => {
    return {
        lean: async () => {
            const ids = query._id.$in || [];
            return ids.map(id => {
                const idStr = id.toString();
                if (idStr === "698de200eebee6c7a313dd32") return null; // Orphan
                if (idStr === "69c4be0fd8c5cd0d6c90e999") return { _id: id, status: 'active', isActive: true, isDeleted: false }; // Valid
                return null;
            }).filter(Boolean);
        }
    };
};

Team.find = (query) => {
    return {
        lean: async () => {
            const ids = query._id.$in || [];
            return ids.map(id => {
                const idStr = id.toString();
                if (idStr === "69c4be0fd8c5cd0d6c90e333") return { _id: id, isActive: true, isDeleted: false };
                return null;
            }).filter(Boolean);
        }
    };
};

// Mock process.exit to prevent test runner from exiting
const originalExit = process.exit;
let exitCode = null;
process.exit = (code) => {
    exitCode = code;
    // Don't throw, just record it, so we don't trigger the catch block.
};

async function runTests() {
    console.log("Running Seed Distribution Rule Remediation Tests...");

    let passed = 0;
    let failed = 0;

    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (error) {
            console.error(`❌ ${name}`);
            console.error(error);
            failed++;
        }
    };

    await test("A. seed path cannot create orphaned user target", async () => {
        exitCode = null;
        createdOrUpdatedRule = null;
        process.env.TARGET_AGENT_ID = "698de200eebee6c7a313dd32";
        
        // Dynamic import evaluates once, so we append query string to bypass cache
        await import(`../scripts/seedDistributionRule.js?time=${Date.now()}`);
        
        // We wait a tiny bit for the async IIFE to complete
        await new Promise(r => setTimeout(r, 100));

        assert.strictEqual(exitCode, 1, "Script should have exited with error code 1");
        assert.strictEqual(createdOrUpdatedRule, null, "Rule should NOT have been created/updated");
    });

    await test("B. seed path cannot create nonexistent team target", async () => {
        exitCode = null;
        createdOrUpdatedRule = null;
        process.env.TARGET_AGENT_ID = "nonexistent_team_id12345"; // Invalid format
        
        await import(`../scripts/seedDistributionRule.js?time=${Date.now()}`);
        await new Promise(r => setTimeout(r, 100));

        assert.strictEqual(exitCode, 1, "Script should have exited with error code 1");
        assert.strictEqual(createdOrUpdatedRule, null, "Rule should NOT have been created/updated");
    });

    await test("C. valid seed configuration remains possible if intentionally retained", async () => {
        exitCode = null;
        createdOrUpdatedRule = null;
        process.env.TARGET_AGENT_ID = "69c4be0fd8c5cd0d6c90e999";
        
        await import(`../scripts/seedDistributionRule.js?time=${Date.now()}`);
        await new Promise(r => setTimeout(r, 100));

        assert.strictEqual(exitCode, 0, "Script should have exited with success code 0");
        assert.notStrictEqual(createdOrUpdatedRule, null, "Rule SHOULD have been created/updated");
        assert.strictEqual(createdOrUpdatedRule.assignmentTarget.ids[0], "69c4be0fd8c5cd0d6c90e999");
    });

    // Restore exit
    process.exit = originalExit;

    console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
