#!/usr/bin/env node
/**
 * preflight-aws-check.js
 * Phase 17: Deployment Preflight & AWS Infrastructure Configuration Validator
 * 
 * Executes dry-run validation of the environment configuration,
 * ensuring AWS region, S3 bucket names, encryption specifications,
 * and credential strategies conform to enterprise standards without leaking secrets.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import AWSConfigValidator from '../services/infrastructure/AWSConfigValidator.js';

export function runPreflight(env = process.env, options = {}) {
    const isQuiet = options.quiet === true;
    const shouldExit = options.exitProcess !== false;

    try {
        if (!isQuiet) console.log('🔍 Executing Phase 17 AWS Preflight Infrastructure Check...');

        const result = AWSConfigValidator.validateDryRun(env);

        if (!isQuiet) {
            console.log('\n--- SANITIZED CONFIGURATION AUDIT ---');
            console.log(JSON.stringify(result.sanitizedConfig, null, 2));

            if (result.warnings.length > 0) {
                console.log('\n⚠️  WARNINGS:');
                for (const w of result.warnings) {
                    console.log(`   - ${w}`);
                }
            }
        }

        if (!result.valid) {
            if (!isQuiet) {
                console.error('\n❌ PREFLIGHT CHECK FAILED:');
                for (const err of result.errors) {
                    console.error(`   - ${err}`);
                }
            }
            if (shouldExit) process.exit(1);
            return { valid: false, exitCode: 1, errors: result.errors, warnings: result.warnings, sanitizedConfig: result.sanitizedConfig };
        }

        if (!isQuiet) {
            console.log('\n✅ PREFLIGHT CHECK PASSED: AWS configuration is valid and meets enterprise requirements.\n');
        }
        if (shouldExit) process.exit(0);
        return { valid: true, exitCode: 0, errors: [], warnings: result.warnings, sanitizedConfig: result.sanitizedConfig };
    } catch (err) {
        const sanitized = AWSConfigValidator.sanitizeConfigForLog(err);
        if (!isQuiet) {
            console.error('\n❌ UNHANDLED PREFLIGHT EXCEPTION:');
            console.error(`   - ${sanitized.message || err.message}`);
        }
        if (shouldExit) process.exit(1);
        return { valid: false, exitCode: 1, errors: [sanitized.message || err.message] };
    }
}

// Execute when invoked directly from CLI
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) {
    runPreflight();
}

export default runPreflight;
