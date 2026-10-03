import { execSync } from 'child_process';
import assert from 'assert';

try {
    execSync('bash scripts/deploy-aws.sh', { stdio: 'pipe' });
    assert.fail("Should have failed closed when DEPLOY_KNOWN_HOSTS_FILE is missing");
} catch (e) {
    const err = e.stdout.toString() + (e.stderr ? e.stderr.toString() : '');
    assert(err.includes('DEPLOY_KNOWN_HOSTS_FILE is not set'), "Must reject missing hosts file");
}

try {
    execSync('DEPLOY_KNOWN_HOSTS_FILE=/does/not/exist bash scripts/deploy-aws.sh', { stdio: 'pipe' });
    assert.fail("Should have failed closed when DEPLOY_KNOWN_HOSTS_FILE does not exist");
} catch (e) {
    const err = e.stdout.toString() + (e.stderr ? e.stderr.toString() : '');
    assert(err.includes('does not exist'), "Must reject invalid hosts file path");
}

console.log("✅ SSH Host Verification tests passed.");
