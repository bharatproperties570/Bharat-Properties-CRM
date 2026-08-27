const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'services/VariableResolutionService.js');
let code = fs.readFileSync(file, 'utf8');

const target = `                    let pr = 'Price on call';
                    if (!lead.hidePrice && !lead.hidePrices) {
                        const rawPrice = p.price || inv.price?.value || inv.price;
                        if (rawPrice && !isNaN(rawPrice)) {
                            pr = \`₹\${(Number(rawPrice) / 10000000).toFixed(2)} Cr\`;
                        } else {
                            pr = rawPrice || 'On Request';
                        }
                    }`;

const replacement = `                    let pr = 'Price on call';
                    if (!lead.hidePrice && !lead.hidePrices) {
                        let rawPrice = p.price;
                        if (rawPrice === undefined || rawPrice === null) {
                            rawPrice = inv.price?.value !== undefined ? inv.price.value : inv.price;
                        }
                        
                        if (typeof rawPrice === 'object' && rawPrice !== null) {
                            rawPrice = rawPrice.lookup_value || rawPrice.label || rawPrice.name || 'On Request';
                        }

                        if (rawPrice && !isNaN(rawPrice) && Number(rawPrice) > 0) {
                            pr = \`₹\${(Number(rawPrice) / 10000000).toFixed(2)} Cr\`;
                        } else {
                            pr = (rawPrice === 0 || rawPrice === '0') ? 'On Request' : (rawPrice || 'On Request');
                        }
                    }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync(file, code);
    console.log('✅ Patched VariableResolutionService.js for [object Object] price');
} else {
    console.log('❌ Could not find target code in VariableResolutionService.js');
}
