import assert from 'assert';
import { validateDistributionTargets, DistributionError } from '../src/validators/distributionTargetValidator.js';
import User from '../models/User.js';
import Team from '../models/Team.js';
import { normalizeDistributionRulePayload } from '../controllers/distributionRule.controller.js';

async function runTests() {
    console.log("Running Distribution Target Validator Tests...");

    User.find = (query) => {
        return {
            lean: async () => {
                const ids = query._id.$in;
                return ids.map(id => {
                    const idStr = id.toString();
                    if (idStr === "698de200eebee6c7a313dd32") {
                        return null; 
                    } else if (idStr === "69c4be0fd8c5cd0d6c90e999") {
                        return { _id: id, status: 'active', isActive: true, isDeleted: false };
                    } else if (idStr === "69c4be0fd8c5cd0d6c90e111") {
                        return { _id: id, status: 'inactive', isActive: false, isDeleted: false };
                    } else if (idStr === "69c4be0fd8c5cd0d6c90e222") {
                        return { _id: id, status: 'active', isActive: true, isDeleted: true };
                    }
                    return null;
                }).filter(Boolean);
            }
        };
    };

    Team.find = (query) => {
        return {
            lean: async () => {
                const ids = query._id.$in;
                return ids.map(id => {
                    const idStr = id.toString();
                    if (idStr === "69c4be0fd8c5cd0d6c90e333") {
                        return { _id: id, isActive: true, isDeleted: false };
                    } else if (idStr === "69c4be0fd8c5cd0d6c90e555") {
                        return { _id: id, isActive: false, isDeleted: false };
                    }
                    return null;
                }).filter(Boolean);
            }
        };
    };

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

    await test("A. Valid user target accepted", async () => {
        await validateDistributionTargets({
            assignmentTarget: { type: 'user', ids: ["69c4be0fd8c5cd0d6c90e999"] }
        });
    });

    await test("B. Missing user rejected (Orphaned reference case)", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'user', ids: ["698de200eebee6c7a313dd32"] }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_NOT_FOUND');
        }
    });

    await test("C. Inactive user rejected", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'user', ids: ["69c4be0fd8c5cd0d6c90e111"] }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_INACTIVE');
        }
    });

    await test("D. Deleted user rejected", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'user', ids: ["69c4be0fd8c5cd0d6c90e222"] }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_INACTIVE');
        }
    });

    await test("E. Duplicate user IDs rejected", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'user', ids: ["69c4be0fd8c5cd0d6c90e999", "69c4be0fd8c5cd0d6c90e999"] }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_DUPLICATE');
        }
    });

    await test("F. Invalid ObjectId rejected", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'user', ids: ["invalid_id"] }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_ID_INVALID');
        }
    });

    await test("G. Valid team target accepted", async () => {
        await validateDistributionTargets({
            assignmentTarget: { type: 'team', ids: ["69c4be0fd8c5cd0d6c90e333"] }
        });
    });

    await test("H. Missing team rejected", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'team', ids: ["69c4be0fd8c5cd0d6c90e444"] }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_NOT_FOUND');
        }
    });

    await test("I. Inactive team rejected", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'team', ids: ["69c4be0fd8c5cd0d6c90e555"] }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_INACTIVE');
        }
    });

    await test("I2. Duplicate team IDs rejected", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'team', ids: ["69c4be0fd8c5cd0d6c90e333", "69c4be0fd8c5cd0d6c90e333"] }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_DUPLICATE');
        }
    });

    await test("J. Fallback team missing rejected", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'user', ids: ["69c4be0fd8c5cd0d6c90e999"] },
                fallbackTarget: { type: 'team', id: "69c4be0fd8c5cd0d6c90e444" }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_NOT_FOUND');
        }
    });

    await test("K. Fallback team inactive rejected", async () => {
        try {
            await validateDistributionTargets({
                assignmentTarget: { type: 'user', ids: ["69c4be0fd8c5cd0d6c90e999"] },
                fallbackTarget: { type: 'team', id: "69c4be0fd8c5cd0d6c90e555" }
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_INACTIVE');
        }
    });

    await test("L. Fallback team valid accepted", async () => {
        await validateDistributionTargets({
            assignmentTarget: { type: 'user', ids: ["69c4be0fd8c5cd0d6c90e999"] },
            fallbackTarget: { type: 'team', id: "69c4be0fd8c5cd0d6c90e333" }
        });
    });

    await test("L. Legacy assignedAgents normalized and validated", async () => {
        const payload = normalizeDistributionRulePayload({
            assignedAgents: ["698de200eebee6c7a313dd32"]
        });
        try {
            await validateDistributionTargets(payload);
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_NOT_FOUND');
        }
    });

    await test("M. Update without target preserves existing target", async () => {
        const payload = normalizeDistributionRulePayload({}, {
            assignmentTarget: { type: 'user', ids: ["69c4be0fd8c5cd0d6c90e999"] }
        });
        await validateDistributionTargets(payload);
    });

    await test("N. Enabled rule cannot be saved with invalid target", async () => {
        const payload = normalizeDistributionRulePayload({
            enabled: true,
            assignmentTarget: { type: 'user', ids: ["698de200eebee6c7a313dd32"] }
        });
        try {
            await validateDistributionTargets(payload);
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_NOT_FOUND');
        }
    });

    await test("O. Disabled rule behavior matches the chosen design and is tested", async () => {
        const payload = normalizeDistributionRulePayload({
            enabled: false,
            assignmentTarget: { type: 'user', ids: ["698de200eebee6c7a313dd32"] }
        });
        try {
            await validateDistributionTargets(payload);
            assert.fail("Should have thrown");
        } catch (e) {
            assert.strictEqual(e.code, 'DISTRIBUTION_TARGET_NOT_FOUND');
        }
    });

    console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
