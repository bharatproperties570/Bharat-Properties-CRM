import fs from 'fs';
const path = './services/VariableResolutionService.js';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `const rawPrice = p.price || inv.price?.value || inv.price;`;
const replacementStr = `let rawPrice = p.price;
                        if (rawPrice === undefined || rawPrice === null) {
                            rawPrice = (inv.price && typeof inv.price === 'object') ? inv.price.value : inv.price;
                        }`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replacementStr);
    fs.writeFileSync(path, code);
    console.log('PATCHED VARIABLE RESOLUTION');
} else {
    console.log('COULD NOT FIND TARGET');
}
