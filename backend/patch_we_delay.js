import fs from 'fs';
const path = './src/utils/WorkflowEngine.js';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `                    if (delayMs > 0) {`;
const insertStr = `                    console.log('[DEBUG_DELAY]', { relativeDate, offsetMs, targetDate, now: Date.now(), delayMs });
                    if (delayMs > 0) {`;

if (code.includes(targetStr) && !code.includes('[DEBUG_DELAY]')) {
    code = code.replace(targetStr, insertStr);
    fs.writeFileSync(path, code);
    console.log('PATCHED');
} else {
    console.log('NOT PATCHED OR ALREADY PATCHED');
}
