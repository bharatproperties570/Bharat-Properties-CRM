const fs = require('fs');
const glob = require('glob');

const files = [
  'src/pages/Leads/LeadsPage.jsx',
  'src/pages/Deals/DealsPage.jsx',
  'src/pages/Contacts/ContactsPage.jsx',
  'src/pages/Inventory/components/InventoryTable.jsx',
  'src/pages/Inventory/components/InventoryMapList.jsx'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf-8');
    
    // Replace color: '#2563eb' with color: isDark ? 'var(--gold)' : '#2563eb'
    content = content.replace(/color:\s*'#2563eb'/g, "color: isDark ? 'var(--gold)' : '#2563eb'");
    
    // Sometimes it's used without quotes if inside template literal, but it's usually in style objects
    // Let's also catch '#2563eb' used directly in JSX like:
    content = content.replace(/"#2563eb"/g, "isDark ? 'var(--gold)' : '#2563eb'");
    
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Updated ${file}`);
  }
}
