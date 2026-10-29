#!/usr/bin/env node
/**
 * preflight-aws-check.js
 * Phase 17: Deployment Preflight & AWS Infrastructure Configuration Validator
 * 
 * Executes dry-run validation of the environment configuration,
 * ensuring AWS region, S3 bucket names, encryption specifications,
 * and credential strategies conform to enterprise standards without leaking secrets.
 */

import AWSConfigValidator from '../services/infrastructure/AWSConfigValidator.js';

function runPreflight() {
    console.log('🔍 Executing Phase 17 AWS Preflight Infrastructure Check...');

    const result = AWSConfigValidator.validateDryRun(process.env);

    console.log('\n--- SANITIZED CONFIGURATION AUDIT ---');
    console.log(JSON.stringify(result.sanitizedConfig, null, 2));

    if (result.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        for (const w of result.warnings) {
            console.log(`   - ${w}`);
        }
    }

    if (!result.valid) {
        console.error('\n❌ PREFLIGHT CHECK FAILED:');
        for (const err of result.errors) {
            console.error(`   - ${err}`);
        }
        process.exit(1);
    }

    console.log('\n✅ PREFLIGHT CHECK PASSED: AWS configuration is valid and meets enterprise requirements.\n');
    process.exit(0);
}

runPreflight();
