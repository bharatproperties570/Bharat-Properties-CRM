import fs from 'fs';
const path = './src/workers/marketingWorker.js';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `const req = { query: { leadId, budgetFlexibility: 20, sizeFlexibility: 20 } };`;
const replacementStr = `const req = { 
                query: { leadId, budgetFlexibility: 20, sizeFlexibility: 20 },
                user: { _id: 'system', companyId: companyId || '698b3303861a01e0b0816896', role: 'admin', dataScope: 'all', email: 'system@marketing' }
            };`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replacementStr);
    fs.writeFileSync(path, code);
    console.log('PATCHED MARKETING WORKER');
} else {
    console.log('COULD NOT FIND TARGET');
}
