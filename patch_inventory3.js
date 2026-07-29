import fs from 'fs';
const file = '/home/ubuntu/bharat-properties-crm/backend/models/Inventory.js';
let content = fs.readFileSync(file, 'utf8');

const schemaInjection = `    totalLandAreaText: String,
    numberOfOwner: String,
    frontOnRoad: String,`;
content = content.replace(`    totalLandAreaText: String,`, schemaInjection);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched Inventory.js successfully with number of owner and front on road');
