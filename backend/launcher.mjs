import process from 'process';
import path from 'path';
import fs from 'fs';

const CURRENT_DIR = '/home/ubuntu/bharat-crm-releases/current';
const RELEASE_ROOT_CONFIG = '/home/ubuntu/bharat-crm-releases/releases/';

try {
    // 1 & 2. current exists and resolves successfully
    const resolvedTarget = fs.realpathSync(CURRENT_DIR);
    const resolvedReleaseRoot = fs.realpathSync(RELEASE_ROOT_CONFIG);
    
    // 3 & 4. resolved target is under /home/ubuntu/bharat-crm-releases/releases/
    if (!resolvedTarget.startsWith(resolvedReleaseRoot)) {
        throw new Error(`Security Violation: Target path ${resolvedTarget} escapes intended release boundary ${resolvedReleaseRoot}.`);
    }

    const serverPath = path.join(CURRENT_DIR, 'src', 'server.js');
    // 5. current/src/server.js exists
    if (!fs.existsSync(serverPath)) {
        throw new Error(`Application entrypoint not found at: ${serverPath}`);
    }

    // 6. only then: process.chdir(current)
    process.chdir(CURRENT_DIR);
    
    // 7. dynamic import executes the application
    await import(serverPath);
} catch (error) {
    console.error('[PM2 Stable Launcher] Fatal application startup error:', error);
    process.exit(1);
}
