#!/usr/bin/env node
import fs from 'fs';

const logPath = process.argv[2] || 'test_authority.log';
if (!fs.existsSync(logPath)) {
    console.error(`ERROR: Test log file not found at "${logPath}"`);
    process.exit(1);
}

const content = fs.readFileSync(logPath, 'utf8');

// Required specific tests that must be explicitly present in the output
const REQUIRED_TESTS = [
    'S14a: controller imports buildCompositeKey from Phase 1 normalizer',
    'S14b: all three authority codes match Phase 1 registry',
    'S14c: Phase 1 sources remain disabled in Phase 2',
    'S15a: models use distinct collection names',
    'S16a: all constants are exported'
];

const missingTests = [];
for (const testName of REQUIRED_TESTS) {
    if (!content.includes(testName)) {
        missingTests.push(testName);
    }
}

if (missingTests.length > 0) {
    console.error('FAIL: Missing required test case(s) in authority test output:');
    for (const t of missingTests) {
        console.error(`  - ${t}`);
    }
    process.exit(1);
}

// Extract top-level test summaries from each node test runner invocation
const lines = content.split('\n');
const summaries = [];

for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const clean = l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '').trim();
    const mTests = clean.match(/^(?:#|ℹ)\s+tests\s+(\d+)$/);
    if (mTests) {
        let pass = 0;
        let fail = 0;
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const c2 = lines[j].replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '').trim();
            const mPass = c2.match(/^(?:#|ℹ)\s+pass\s+(\d+)$/);
            const mFail = c2.match(/^(?:#|ℹ)\s+fail\s+(\d+)$/);
            if (mPass) pass = parseInt(mPass[1], 10);
            if (mFail) fail = parseInt(mFail[1], 10);
        }
        summaries.push({ tests: parseInt(mTests[1], 10), pass, fail });
    }
}

if (summaries.length === 0) {
    console.error('FAIL: No test summary blocks found in test log.');
    process.exit(1);
}

const totalTests = summaries.reduce((sum, s) => sum + s.tests, 0);
const totalPass = summaries.reduce((sum, s) => sum + s.pass, 0);
const totalFail = summaries.reduce((sum, s) => sum + s.fail, 0);

console.log(`[CI Completeness Gate] Found ${summaries.length} test runner invocation summary block(s):`);
summaries.forEach((s, idx) => {
    console.log(`  Invocation ${idx + 1}: tests=${s.tests}, pass=${s.pass}, fail=${s.fail}`);
});
console.log(`[CI Completeness Gate] Aggregated Totals: tests=${totalTests}, pass=${totalPass}, fail=${totalFail}`);

const EXPECTED_TOTAL = 468;

if (totalTests !== EXPECTED_TOTAL) {
    console.error(`FAIL: Expected exactly ${EXPECTED_TOTAL} total tests, but counted ${totalTests}.`);
    process.exit(1);
}

if (totalPass !== EXPECTED_TOTAL) {
    console.error(`FAIL: Expected exactly ${EXPECTED_TOTAL} passing tests, but counted ${totalPass}.`);
    process.exit(1);
}

if (totalFail !== 0) {
    console.error(`FAIL: Expected 0 failures, but encountered ${totalFail} failure(s).`);
    process.exit(1);
}

console.log(`SUCCESS: All ${EXPECTED_TOTAL} authority test cases executed cleanly with zero failures.`);
console.log('SUCCESS: All required S14–S16 assertions confirmed present.');
process.exit(0);
