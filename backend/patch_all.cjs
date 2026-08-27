const fs = require('fs');

const wfFile = './src/utils/WorkflowEngine.js';
let wfCode = fs.readFileSync(wfFile, 'utf8');
const search = 'if (!isDelayedExecution && action.type === \'fire_automated_action\' && action.automatedActionId) {';
const repl = 'if (action.type === \'fire_automated_action\' && action.automatedActionId) {';
const search2 = 'if (autoAction && autoAction.delay && autoAction.delay.isActive) {';
const repl2 = 'if (!isDelayedExecution && autoAction && autoAction.delay && autoAction.delay.isActive) {';
if(wfCode.includes(search)) {
    wfCode = wfCode.replace(search, repl);
    wfCode = wfCode.replace(search2, repl2);
    wfCode = wfCode.replace(/await import\('\.\.\/\.\.\/queues\/marketingQueue\.js'\)/g, 'await import(\'../queues/marketingQueue.js\')');
    fs.writeFileSync(wfFile, wfCode);
    console.log('Patched WorkflowEngine.js');
}

const vrFile = './services/VariableResolutionService.js';
let vrCode = fs.readFileSync(vrFile, 'utf8');
if (!vrCode.includes('extractArrayValue(val) {')) {
    const insertCode = `
    extractArrayValue(val) {
        if (!val) return '';
        if (Array.isArray(val)) {
            return val.map(v => typeof v === 'object' ? (v.lookup_value || v.name || v.label || '') : String(v)).filter(Boolean).join(', ');
        }
        return typeof val === 'object' ? (val.lookup_value || val.name || val.label || '') : String(val);
    }
`;
    vrCode = vrCode.replace('extractValue(lead, source, customVal = \'\') {', insertCode + '    extractValue(lead, source, customVal = \'\') {');
    fs.writeFileSync(vrFile, vrCode);
    console.log('Patched VariableResolutionService.js');
}
