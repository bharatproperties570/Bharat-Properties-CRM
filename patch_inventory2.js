import fs from 'fs';
const file = '/home/ubuntu/bharat-properties-crm/backend/models/Inventory.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Add to Schema
const schemaInjection = `    waterPumpType: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },
    landDetails: [{
        khewatNo: String,
        killaNo: String,
        share: String,
        calculatedMarlas: Number
    }],
    totalLandAreaText: String,`;
content = content.replace(`    waterPumpType: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },`, schemaInjection);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched Inventory.js successfully with land details');
