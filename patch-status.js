import fs from 'fs';
let content = fs.readFileSync('src/components/ProfessionalMap.jsx', 'utf8');
content = content.replace(
    /let pricingHtml = '';/,
    "const statusDisplay = item.status?.lookup_value || item.status || 'Active';\n                    let pricingHtml = '';"
);
fs.writeFileSync('src/components/ProfessionalMap.jsx', content);
