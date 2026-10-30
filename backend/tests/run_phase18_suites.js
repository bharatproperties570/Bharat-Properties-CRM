/**
 * run_phase18_suites.js
 * 
 * Master Runner for Phase 18 Site Visit & Marketing OS Attribution Test Suite
 * 
 * Sequentially executes all Phase 18 verified test suites and reports granular results:
 * 1.  Phase 18 Marketing OS Attribution & Full-Funnel Analytics (node --test)
 * 2.  Staging Acceptance & Real Multi-Document ACID Transactions (MongoMemoryReplSet)
 * 3.  Production Readiness: Messaging, Delivery State Monotonicity & Transactions
 * 4.  Client Site Visit Journey, IDOR Protection & Sequential Feedback Gates
 * 5.  Canonical Site Visit Domain Workflows & State Machine
 * 6.  Runtime Reliability & Site Visit Contracts
 * 7.  Site Visit Automation & Notification Triggers
 * 8.  Security, Authorization & Genuine Notification Delivery
 * 9.  Marketing OS Content & Campaign Attribution
 * 10. Deal & Booking Closed-Loop Attribution
 * 11. Customer Feedback Closed-Loop & Intent Boost
 * 12. Analytics & Reporting Aggregation (Tenant Scoping & Injection Guards)
 * 13. End-to-End Enterprise Integration & Verification (10-Stage Lifecycle)
 * 14. P0 Security & Data Integrity Remediation Regression Suite
 * 15. Enterprise withMongoTransaction Hardened Wrapper Unit Suite
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');

const suites = [
    {
        name: 'Phase 18 Marketing OS Attribution & Analytics',
        cmd: 'node',
        args: ['--test', '--test-force-exit', '--test-concurrency=1', 'tests/phase18_marketing_attribution.test.js']
    },
    {
        name: 'Real Multi-Document ACID Transactions & Staging Acceptance',
        cmd: 'node',
        args: ['tests/test_staging_acceptance_real_tx.js']
    },
    {
        name: 'Site Visit Production Readiness (Delivery Monotonicity & Trans.)',
        cmd: 'node',
        args: ['tests/test_sitevisit_readiness_delivery_tx.js']
    },
    {
        name: 'Client Journey Tokens, IDOR & Sequential Property Gates',
        cmd: 'node',
        args: ['tests/test_sitevisit_journey.js']
    },
    {
        name: 'Canonical Site Visit Domain Transitions & State Machine',
        cmd: 'node',
        args: ['tests/test_sitevisit_domain.js']
    },
    {
        name: 'Runtime Reliability & Site Visit Contracts',
        cmd: 'node',
        args: ['tests/test_sitevisit_contracts.js']
    },
    {
        name: 'Site Visit Reminders & Automation Triggers',
        cmd: 'node',
        args: ['tests/test_sitevisit_automation.js']
    },
    {
        name: 'Site Visit Security, Authorization & Notification Delivery',
        cmd: 'node',
        args: ['tests/test_sitevisit_security_delivery.js']
    },
    {
        name: 'Marketing OS Content & Campaign Attribution',
        cmd: 'node',
        args: ['tests/test_marketing_attribution.js']
    },
    {
        name: 'Deal & Booking Closed-Loop Attribution',
        cmd: 'node',
        args: ['tests/test_deal_attribution.js']
    },
    {
        name: 'Customer Feedback Closed-Loop & Escalation',
        cmd: 'node',
        args: ['tests/test_feedback_closed_loop.js']
    },
    {
        name: 'Analytics Aggregation, Tenant Isolation & Query Guards',
        cmd: 'node',
        args: ['tests/test_analytics_aggregation.js']
    },
    {
        name: 'End-to-End Enterprise Site Visit & Marketing Lifecycle',
        cmd: 'node',
        args: ['tests/test_e2e_sitevisit_marketing.js']
    },
    {
        name: 'P0 Security & Fail-Closed Guards',
        cmd: 'node',
        args: ['tests/test_p0_security.js']
    },
    {
        name: 'Hardened withMongoTransaction Wrapper Suite',
        cmd: 'node',
        args: ['tests/utils/withMongoTransaction.test.js']
    }
];

async function runSuite(suite, index) {
    console.log(`\n================================================================`);
    console.log(`[${index + 1}/${suites.length}] RUNNING: ${suite.name}`);
    console.log(`Command: ${suite.cmd} ${suite.args.join(' ')}`);
    console.log(`================================================================`);

    const startTime = Date.now();

    return new Promise((resolve) => {
        const child = spawn(suite.cmd, suite.args, {
            cwd: backendDir,
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || 'test',
                MONGOMS_DISABLE_POSTINSTALL: '1'
            }
        });

        child.on('close', (code) => {
            const durationMs = Date.now() - startTime;
            if (code === 0) {
                console.log(`\n>>> SUCCESS: ${suite.name} passed in ${(durationMs / 1000).toFixed(2)}s`);
                resolve({ name: suite.name, success: true, durationMs });
            } else {
                console.error(`\n>>> FAILURE: ${suite.name} exited with code ${code} after ${(durationMs / 1000).toFixed(2)}s`);
                resolve({ name: suite.name, success: false, durationMs, exitCode: code });
            }
        });

        child.on('error', (err) => {
            const durationMs = Date.now() - startTime;
            console.error(`\n>>> ERROR: ${suite.name} failed to start:`, err.message);
            resolve({ name: suite.name, success: false, durationMs, error: err.message });
        });
    });
}

async function runAll() {
    console.log(`Starting Phase 18 Master Test Suite Execution (${suites.length} suites total)...`);
    const overallStart = Date.now();
    const results = [];

    for (let i = 0; i < suites.length; i++) {
        const res = await runSuite(suites[i], i);
        results.push(res);
        if (!res.success) {
            console.error(`\n❌ Execution halted due to failure in suite: ${res.name}`);
            break;
        }
    }

    const totalDuration = ((Date.now() - overallStart) / 1000).toFixed(2);
    const passedSuites = results.filter(r => r.success).length;
    const failedSuites = results.filter(r => !r.success).length;

    console.log(`\n================================================================`);
    console.log(`PHASE 18 TEST EXECUTION SUMMARY`);
    console.log(`================================================================`);
    results.forEach((r, idx) => {
        const icon = r.success ? '✅' : '❌';
        console.log(`  ${icon} [Suite ${idx + 1}] ${r.name.padEnd(58)} (${(r.durationMs / 1000).toFixed(2)}s)`);
    });
    console.log(`----------------------------------------------------------------`);
    console.log(`Total Suites: ${suites.length} | Passed: ${passedSuites} | Failed: ${failedSuites} | Time: ${totalDuration}s`);
    console.log(`================================================================\n`);

    if (failedSuites > 0 || results.length !== suites.length) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runAll();
