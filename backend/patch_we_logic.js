import fs from 'fs';
const path = './src/utils/WorkflowEngine.js';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `            if (!isDelayedExecution && action.type === 'fire_automated_action' && action.automatedActionId) {`;
const replacementStr = `            if (action.type === 'fire_automated_action' && action.automatedActionId) {`;

const targetStr2 = `                if (autoAction && autoAction.delay && autoAction.delay.isActive) {`;
const replacementStr2 = `                if (!isDelayedExecution && autoAction && autoAction.delay && autoAction.delay.isActive) {`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replacementStr);
    code = code.replace(targetStr2, replacementStr2);
    fs.writeFileSync(path, code);
    console.log('PATCHED LOGIC');
} else {
    console.log('COULD NOT FIND TARGET');
}
